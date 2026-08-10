from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.repositories.task_repository import task_repository
from app.services.tasks.events import TaskEventEmitter
from app.services.generation.student_generation_service import student_generation_service
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.learning_path_repository import learning_path_repository
from app.repositories.question_repository import question_repository
from app.repositories.resource_repository import resource_repository
from app.repositories.test_repository import student_test_repository
from app.schemas.test import StudentTestGenerateRequest
from app.services.generation.question_generation_service import question_generation_service
from app.services.generation.reference_context_service import reference_context_service
from app.services.quality_analysis_service import quality_analysis_service
from app.tasks.celery_app import celery_app


logger = logging.getLogger(__name__)

RESOURCE_TASK_TYPES = {
    "student_resource_generation",
    "student_resource_single_generation",
}


def _assert_student_owner(owner_id: int, user: User) -> None:
    if user.role != UserRole.admin and owner_id != user.id:
        raise ValueError("No permission to use the selected source")


def _question_preview(topic: str, questions: list[dict]) -> str:
    lines = [f"# {topic}测验", ""]
    type_labels = {
        "single_choice": "单选题", "multiple_choice": "多选题",
        "true_false": "判断题", "short_answer": "简答题",
    }
    for index, question in enumerate(questions, start=1):
        lines.extend([
            f"## {index}. {type_labels.get(str(question.get('question_type')), '题目')}",
            str(question.get("stem") or ""),
        ])
        for option in question.get("options") or []:
            lines.append(f"- {option.get('key')}. {option.get('text')}")
        lines.append("")
    return "\n".join(lines)


@celery_app.task(name="app.tasks.resource_tasks.run_student_test_generation_task")
def run_student_test_generation_task(task_id: int) -> int:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    db = SessionLocal()
    try:
        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise ValueError(f"generation task {task_id} not found")
        emitter = TaskEventEmitter(db, task)
        emitter.stage("validating")
        payload_data = (task.input_payload or {}).get("payload") or {}
        payload = StudentTestGenerateRequest.model_validate(payload_data)
        user = db.get(User, task.owner_id)
        if user is None:
            raise ValueError("Task owner not found")

        path_id = payload.learning_path_id or payload.path_id
        resource = resource_repository.get_by_id(db, payload.resource_id) if payload.resource_id else None
        if payload.resource_id and resource is None:
            raise ValueError("Learning resource not found")
        if resource is not None:
            _assert_student_owner(resource.user_id, user)
        path = learning_path_repository.get_by_id(db, path_id) if path_id else None
        if path_id and path is None:
            raise ValueError("Learning path not found")
        if path is not None:
            _assert_student_owner(path.user_id, user)
        step = None
        if payload.learning_path_step_id is not None:
            if path_id is None:
                raise ValueError("path_id is required with learning_path_step_id")
            step = learning_path_repository.get_step(
                db, path_id=path_id, step_id=payload.learning_path_step_id, for_update=True,
            )
            if step is None or step.status != "quiz_required":
                raise ValueError("Complete step learning before generating its test")

        emitter.stage("parsing_references")
        reference_context = reference_context_service.build(
            db, current_user=user, file_ids=payload.file_ids,
            knowledge_document_ids=payload.knowledge_document_ids,
            use_knowledge_base=payload.use_knowledge_base, top_k=payload.top_k,
            course_id=payload.course_id, query=payload.topic,
        )
        for reference in reference_context.references:
            emitter.reference(reference)
        for warning in reference_context.warnings:
            emitter.warning(str(warning))
        emitter.stage("retrieving")
        bank_questions = question_repository.find_questions(
            db, topic=payload.topic, difficulty=payload.difficulty,
            knowledge_points=payload.knowledge_points, question_types=payload.question_types,
            limit=payload.question_count,
        ) if payload.use_question_bank else []
        emitter.stage("building_prompt")
        emitter.stage("generating")
        questions, answers = question_generation_service.generate(
            topic=payload.topic, difficulty=payload.difficulty,
            question_count=payload.question_count, question_types=payload.question_types,
            knowledge_points=payload.knowledge_points, bank_questions=bank_questions,
            reference_context=reference_context,
        )
        preview = _question_preview(payload.topic, questions)
        for start in range(0, len(preview), 180):
            emitter.delta(preview[start:start + 180])

        generation_parameters = payload.model_dump(mode="json")
        emitter.stage("quality_analysis")
        quality = quality_analysis_service.analyze_generated_content(
            content={"questions": questions, "answers": answers}, request_payload=generation_parameters,
            references=reference_context.references, warnings=reference_context.warnings,
            difficulty=payload.difficulty, context_label=payload.topic,
        )
        emitter.stage("persisting")
        generated_test = student_test_repository.create_test(
            db, user_id=user.id, topic=payload.topic, difficulty=payload.difficulty,
            questions=questions, answers=answers, learning_path_id=path_id,
            learning_path_step_id=payload.learning_path_step_id, resource_id=payload.resource_id,
            source_type="learning_path_step" if step else ("resource" if payload.resource_id else "standalone"),
            evidence_snapshot={**reference_context.evidence_snapshot, "pass_score": step.pass_score if step else None},
            source_file_ids=payload.file_ids,
            source_document_ids=reference_context.evidence_snapshot["source_document_ids"],
            source_chunk_ids=reference_context.evidence_snapshot["source_chunk_ids"],
            generation_parameters=generation_parameters,
            quality_analysis=quality.model_dump(mode="json"),
        )
        if step is not None and step.step_test_id is None:
            step.step_test_id = generated_test.id
            db.add(step)
            db.commit()
        emitter.done({
            "test_id": generated_test.id,
            "references": reference_context.references,
            "warnings": reference_context.warnings,
        })
        return generated_test.id
    except Exception as exc:
        logger.exception("student test generation task failed: %s", task_id)
        failed_task = task_repository.get_task_by_id(db, task_id)
        if failed_task is not None:
            TaskEventEmitter(db, failed_task).error(RuntimeError(_summarize_error(exc)))
        raise
    finally:
        db.close()


def _summarize_error(exc: Exception) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    return message[:500]


@celery_app.task(name="app.tasks.resource_tasks.run_student_resource_generation_task")
def run_student_resource_generation_task(task_id: int) -> list[int]:
    """Generate student learning resources in a worker process."""
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")

    db = SessionLocal()
    try:
        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise ValueError(f"generation task {task_id} not found")
        if task.task_type not in RESOURCE_TASK_TYPES:
            raise ValueError(f"unsupported resource task type: {task.task_type}")

        emitter = TaskEventEmitter(db, task)
        emitter.stage("validating")

        payload = dict(task.input_payload or {})
        request_payload = payload.get("payload") or {}
        if not isinstance(request_payload, dict):
            raise ValueError("resource task payload is invalid")

        emitter.stage("parsing_references")
        emitter.stage("retrieving")
        emitter.stage("building_prompt")
        emitter.stage("generating")

        result = student_generation_service.generate_resources_for_task(
            db,
            owner_id=task.owner_id,
            task_type=task.task_type,
            payload_data=request_payload,
            task_id=task.id,
            on_delta=emitter.delta,
        )

        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise ValueError(f"generation task {task_id} disappeared")
        resource_ids = [resource.id for resource in result.resources]
        for reference in result.references:
            emitter.reference(reference.model_dump(mode="json"))
        result_payload = {
            "resource_ids": resource_ids,
            "resource_count": len(resource_ids),
            "warnings": result.warnings,
        }
        emitter.stage("quality_analysis")
        for warning in result.warnings:
            emitter.warning(str(warning))
        emitter.stage("persisting")
        emitter.done(result_payload)
        return resource_ids
    except Exception as exc:  # pragma: no cover - worker-side safety net
        logger.exception("student resource generation task failed: %s", task_id)
        failed_task = task_repository.get_task_by_id(db, task_id)
        if failed_task is not None:
            TaskEventEmitter(db, failed_task).error(RuntimeError(_summarize_error(exc)))
        raise
    finally:
        db.close()
