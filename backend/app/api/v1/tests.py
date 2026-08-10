from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_student
from app.core.exceptions import AppException, BadRequestException, ForbiddenException, NotFoundException
from app.models.enums import LearningPathStatus, TestStatus, UserRole
from app.models.learning_path import LearningPath
from app.models.resource import LearningResource
from app.models.test import StudentTest
from app.models.user import User
from app.repositories.assessment_repository import assessment_repository
from app.repositories.learning_path_repository import learning_path_repository
from app.repositories.profile_repository import profile_repository
from app.repositories.question_repository import question_repository
from app.repositories.resource_repository import resource_repository
from app.repositories.test_repository import external_test_status, student_test_repository
from app.repositories.task_repository import task_repository
from app.schemas.common import ApiResponse
from app.schemas.test import (
    StudentTestGenerateRequest,
    StudentTestGenerateResponse,
    StudentTestListResponse,
    StudentTestRead,
    StudentTestStatus,
    StudentTestSubmitRequest,
    StudentTestSubmitResponse,
    StudentTestSummary,
    TestDifficulty,
)
from app.schemas.task import TaskCreateResponse
from app.services.agents.assessment_agent import assessment_agent
from app.services.agents.test_agent import test_agent
from app.services.generation.question_generation_service import question_generation_service
from app.services.generation.reference_context_service import reference_context_service
from app.services.quality_analysis_service import quality_analysis_service
from app.tasks.resource_tasks import run_student_test_generation_task
from app.utils.response import success_response

router = APIRouter()


def _assert_owner_or_admin(*, owner_id: int, current_user: User, message: str) -> None:
    if current_user.role != UserRole.admin and owner_id != current_user.id:
        raise ForbiddenException(message)


def _load_resource(db: Session, resource_id: int | None, current_user: User) -> LearningResource | None:
    if resource_id is None:
        return None
    resource = resource_repository.get_by_id(db, resource_id)
    if resource is None:
        raise NotFoundException("Learning resource not found")
    _assert_owner_or_admin(owner_id=resource.user_id, current_user=current_user, message="No permission to access this learning resource")
    return resource


def _load_path(db: Session, path_id: int | None, current_user: User) -> LearningPath | None:
    if path_id is None:
        return None
    path = learning_path_repository.get_by_id(db, path_id)
    if path is None:
        raise NotFoundException("Learning path not found")
    _assert_owner_or_admin(owner_id=path.user_id, current_user=current_user, message="No permission to access this learning path")
    return path


def _get_accessible_test(db: Session, *, test_id: int, current_user: User) -> StudentTest:
    test = student_test_repository.get_by_id(db, test_id)
    if test is None:
        raise NotFoundException("Student test not found")
    _assert_owner_or_admin(owner_id=test.user_id, current_user=current_user, message="No permission to access this student test")
    return test


def _is_submitted(test: StudentTest) -> bool:
    return test.status in {TestStatus.submitted, TestStatus.graded}


def _test_total_score(test: StudentTest) -> float:
    total = sum(float(question.get("score") or 0) for question in (test.questions or []))
    return round(total, 2)


def _test_summary(test: StudentTest) -> StudentTestSummary:
    return StudentTestSummary(
        id=test.id,
        topic=test.topic,
        difficulty=test.difficulty,
        status=external_test_status(test.status),
        score=test.score,
        question_count=len(test.questions or []),
        total_score=_test_total_score(test),
        created_at=test.created_at,
        started_at=test.started_at,
        submitted_at=test.submitted_at,
        learning_path_id=test.learning_path_id,
        learning_path_step_id=test.learning_path_step_id,
        source_type=test.source_type,
    )


def _test_read(test: StudentTest, *, include_answers: bool) -> StudentTestRead:
    question_results = []
    if include_answers:
        question_results = test_agent.grade(
            questions=test.questions or [],
            answers=test.answers or {},
            user_answers=test.user_answers or {},
        )["question_results"]
    return StudentTestRead(
        id=test.id,
        topic=test.topic,
        difficulty=test.difficulty,
        status=external_test_status(test.status),
        questions=test.questions or [],
        total_score=_test_total_score(test),
        score=test.score,
        analysis=test.analysis,
        feedback=test.feedback,
        user_answers=test.user_answers or {},
        answers=test.answers if include_answers else None,
        question_results=question_results if include_answers else [],
        quality_analysis=_test_quality_analysis(test, question_results=question_results if include_answers else None),
        created_at=test.created_at,
        updated_at=test.updated_at,
        started_at=test.started_at,
        submitted_at=test.submitted_at,
        learning_path_id=test.learning_path_id,
        learning_path_step_id=test.learning_path_step_id,
        resource_id=test.resource_id,
        source_type=test.source_type,
        evidence_snapshot=test.evidence_snapshot or {},
        source_file_ids=test.source_file_ids or [],
        source_document_ids=test.source_document_ids or [],
        source_chunk_ids=test.source_chunk_ids or [],
        generation_parameters=test.generation_parameters or {},
    )


def _test_quality_analysis(test: StudentTest, *, question_results: list[dict] | None = None):
    if test.quality_analysis:
        return test.quality_analysis
    return quality_analysis_service.analyze_generated_content(
        content={
            "questions": test.questions or [],
            "answers": test.answers or {},
            "analysis": test.analysis,
            "feedback": test.feedback,
            "question_results": question_results or [],
        },
        request_payload={
            "topic": test.topic,
            "difficulty": test.difficulty,
            "question_count": len(test.questions or []),
        },
        references=[],
        warnings=["Historical test has no persisted generation evidence"],
        difficulty=test.difficulty,
        context_label="学生测试结果",
    )


@router.post(
    "/generate",
    response_model=ApiResponse[StudentTestGenerateResponse],
    summary="Generate a student test",
)
def generate_student_test(
    payload: StudentTestGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    _load_resource(db, payload.resource_id, current_user)
    path_id = payload.learning_path_id or payload.path_id
    _load_path(db, path_id, current_user)
    step = None
    if payload.learning_path_step_id is not None:
        if path_id is None:
            raise BadRequestException("path_id is required with learning_path_step_id")
        step = learning_path_repository.get_step(db, path_id=path_id, step_id=payload.learning_path_step_id, for_update=True)
        if step is None:
            raise NotFoundException("Learning path step not found")
        if step.status != "quiz_required":
            raise BadRequestException("Complete step learning before generating its test")

    bank_questions = []
    if payload.use_question_bank:
        bank_questions = question_repository.find_questions(
            db,
            topic=payload.topic,
            difficulty=payload.difficulty,
            knowledge_points=payload.knowledge_points,
            question_types=payload.question_types,
            limit=payload.question_count,
        )
    reference_context = reference_context_service.build(
        db, current_user=current_user, file_ids=payload.file_ids,
        knowledge_document_ids=payload.knowledge_document_ids,
        use_knowledge_base=payload.use_knowledge_base, top_k=payload.top_k,
        course_id=payload.course_id, query=payload.topic,
    )
    questions, answers = question_generation_service.generate(
        topic=payload.topic,
        difficulty=payload.difficulty,
        question_count=payload.question_count,
        question_types=payload.question_types,
        knowledge_points=payload.knowledge_points,
        bank_questions=bank_questions,
        reference_context=reference_context,
    )
    generation_parameters = payload.model_dump(mode="json")
    quality = quality_analysis_service.analyze_generated_content(
        content={"questions": questions, "answers": answers}, request_payload=generation_parameters,
        references=reference_context.references, warnings=reference_context.warnings,
        difficulty=payload.difficulty, context_label=payload.topic,
    )
    test = student_test_repository.create_test(
        db,
        user_id=current_user.id,
        topic=payload.topic,
        difficulty=payload.difficulty,
        questions=questions,
        answers=answers,
        learning_path_id=path_id,
        learning_path_step_id=payload.learning_path_step_id,
        resource_id=payload.resource_id,
        source_type="learning_path_step" if step else ("resource" if payload.resource_id else "standalone"),
        evidence_snapshot={**reference_context.evidence_snapshot, "pass_score": step.pass_score if step else None},
        source_file_ids=payload.file_ids,
        source_document_ids=reference_context.evidence_snapshot["source_document_ids"],
        source_chunk_ids=reference_context.evidence_snapshot["source_chunk_ids"],
        generation_parameters=generation_parameters,
        quality_analysis=quality.model_dump(mode="json"),
    )
    if step is not None and step.step_test_id is None:
        step.step_test_id = test.id
        db.add(step)
        db.commit()
    data = StudentTestGenerateResponse(
        test_id=test.id,
        topic=test.topic,
        difficulty=test.difficulty,
        status=external_test_status(test.status),
        questions=test.questions or [],
        question_count=len(test.questions or []),
        created_at=test.created_at,
        references=reference_context.references,
        warnings=reference_context.warnings,
        quality_analysis=quality,
    )
    return success_response(data=data, request=request)


@router.post(
    "/generate-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Create an async student test generation task",
)
def generate_student_test_async(
    payload: StudentTestGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    _load_resource(db, payload.resource_id, current_user)
    path_id = payload.learning_path_id or payload.path_id
    _load_path(db, path_id, current_user)
    if payload.learning_path_step_id is not None:
        if path_id is None:
            raise BadRequestException("path_id is required with learning_path_step_id")
        step = learning_path_repository.get_step(
            db,
            path_id=path_id,
            step_id=payload.learning_path_step_id,
            for_update=True,
        )
        if step is None:
            raise NotFoundException("Learning path step not found")
        if step.status != "quiz_required":
            raise BadRequestException("Complete step learning before generating its test")

    task = task_repository.create_task(
        db,
        owner_id=current_user.id,
        task_type="student_test_generation",
        input_payload={
            "source": "student_tests",
            "user_id": current_user.id,
            "payload": payload.model_dump(mode="json"),
        },
    )
    try:
        run_student_test_generation_task.apply_async(args=[task.id])
    except Exception as exc:
        task_repository.mark_task_failed(db, task=task, error_message=str(exc)[:500])
        raise AppException(
            "学生测验异步任务提交失败，请检查 Redis/Celery 是否可用",
            code=50300,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        ) from exc

    data = TaskCreateResponse(
        task_id=task.id,
        task_type=task.task_type,
        status=task.status,
        polling_url=f"/api/v1/tasks/{task.id}",
        stream_url=f"/api/v1/tasks/{task.id}/stream",
    )
    return success_response(data=data, request=request)


@router.post(
    "/{test_id}/start",
    response_model=ApiResponse[StudentTestRead],
    summary="Start a generated student test",
)
def start_student_test(
    test_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    test = _get_accessible_test(db, test_id=test_id, current_user=current_user)
    if _is_submitted(test):
        raise BadRequestException("Submitted tests cannot be restarted")
    if test.status == TestStatus.created:
        test = student_test_repository.start_test(db, test)
    return success_response(data=_test_read(test, include_answers=False), request=request)


@router.post(
    "/{test_id}/submit",
    response_model=ApiResponse[StudentTestSubmitResponse],
    summary="Submit answers and grade a student test",
)
def submit_student_test(
    test_id: int,
    payload: StudentTestSubmitRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    test = _get_accessible_test(db, test_id=test_id, current_user=current_user)
    if _is_submitted(test):
        existing = assessment_repository.get_by_test_id(db, test.id)
        grade = test_agent.grade(questions=test.questions or [], answers=test.answers or {}, user_answers=test.user_answers or {})
        return success_response(data=StudentTestSubmitResponse(
            test_id=test.id, status=external_test_status(test.status), score=float(test.score or 0),
            analysis=test.analysis or "", feedback=test.feedback or "", question_results=grade["question_results"],
            answers=test.answers or {}, assessment_id=existing.id if existing else None,
            quality_analysis=_test_quality_analysis(test, question_results=grade["question_results"]),
        ), request=request)
    if test.status not in {TestStatus.created, TestStatus.started}:
        raise BadRequestException("Current test status does not allow submission")

    grade = test_agent.grade(
        questions=test.questions or [],
        answers=test.answers or {},
        user_answers=payload.user_answers,
    )
    test = student_test_repository.submit_test(
        db,
        test=test,
        user_answers=payload.user_answers,
        score=grade["score"],
        analysis=grade["analysis"],
        feedback=grade["feedback"],
        question_results=grade["question_results"],
    )
    profile = profile_repository.get_by_user_id(db, test.user_id)
    recommendations = assessment_agent.build_recommendations(
        score=grade["score"],
        incorrect_topics=grade["incorrect_topics"],
        profile=profile,
    )
    assessment = assessment_repository.create_assessment(
        db,
        user_id=test.user_id,
        assessment_type="test",
        topic=test.topic,
        resource_id=test.resource_id,
        path_id=test.learning_path_id,
        test_id=test.id,
        score=grade["score"],
        correct_topics=grade["correct_topics"],
        incorrect_topics=grade["incorrect_topics"],
        analysis=grade["analysis"],
        recommendations=recommendations,
    )
    if test.learning_path_id and test.learning_path_step_id:
        from datetime import UTC, datetime
        from app.services.profile_update_service import profile_update_service
        path = learning_path_repository.get_by_id(db, test.learning_path_id)
        step = learning_path_repository.get_step(db, path_id=test.learning_path_id, step_id=test.learning_path_step_id, for_update=True)
        if path is None or step is None:
            raise BadRequestException("Linked learning path step no longer exists")
        step.attempt_count += 1
        if grade["score"] >= step.pass_score and step.status != "completed":
            step.status = "completed"
            step.completed_at = datetime.now(UTC)
            ordered = sorted(path.steps, key=lambda item: item.position)
            next_step = next((item for item in ordered if item.position == step.position + 1), None)
            if next_step is not None and next_step.status == "locked":
                next_step.status = "active"
                next_step.unlocked_at = datetime.now(UTC)
                db.add(next_step)
            completed = sum(item.status == "completed" for item in ordered)
            path.current_step = min(step.position + 1, len(ordered))
            path.completion_rate = round(completed / len(ordered) * 100, 2) if ordered else 100
            if completed == len(ordered):
                path.status = LearningPathStatus.completed
            profile_update_service.apply_event(
                db, user_id=test.user_id, idempotency_key=f"path-step-test:{test.id}", source_type="path_step_completed",
                source_id=str(step.id), reason=f"路径步骤测验通过：{step.title}",
                evidence={"test_id": test.id, "score": grade["score"], "pass_score": step.pass_score},
                dimension="knowledge_score", observed_score=grade["score"],
            )
        db.add(step)
        db.add(path)
        db.commit()
    else:
        from app.services.profile_update_service import profile_update_service
        profile_update_service.apply_event(
            db, user_id=test.user_id, idempotency_key=f"test-completed:{test.id}",
            source_type="test_completed", source_id=str(test.id),
            reason=f"Completed student test: {test.topic}",
            evidence={"test_id": test.id, "score": grade["score"]},
            dimension="exam_score", observed_score=grade["score"],
        )
    data = StudentTestSubmitResponse(
        test_id=test.id,
        status=external_test_status(test.status),
        score=grade["score"],
        analysis=grade["analysis"],
        feedback=grade["feedback"],
        question_results=grade["question_results"],
        answers=test.answers or {},
        assessment_id=assessment.id,
        quality_analysis=_test_quality_analysis(test, question_results=grade["question_results"]),
    )
    return success_response(data=data, request=request)


@router.get(
    "",
    response_model=ApiResponse[StudentTestListResponse],
    summary="List student tests",
)
def list_student_tests(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: StudentTestStatus | None = Query(default=None),
    topic: str | None = Query(default=None),
    difficulty: TestDifficulty | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    items, total = student_test_repository.list_by_user(
        db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        status=status,
        topic=topic,
        difficulty=difficulty,
    )
    data = StudentTestListResponse(
        items=[_test_summary(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.get(
    "/{test_id}",
    response_model=ApiResponse[StudentTestRead],
    summary="Get student test detail",
)
def get_student_test(
    test_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    test = _get_accessible_test(db, test_id=test_id, current_user=current_user)
    return success_response(data=_test_read(test, include_answers=_is_submitted(test)), request=request)
