from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_active_user, require_teacher
from app.core.config import get_settings
from app.core.exceptions import AppException, BadRequestException, ForbiddenException, NotFoundException
from app.api.v1.files import _validate_upload
from app.models.assignment import CourseAssignment, CourseAssignmentSubmission
from app.models.course import Course
from app.models.enums import FileParseStatus, KnowledgeDocumentStatus, UserRole
from app.models.file_asset import FileAsset
from app.models.knowledge import KnowledgeDocument
from app.models.user import User
from app.repositories.course_assignment_repository import course_assignment_repository
from app.repositories.file_repository import file_repository
from app.repositories.knowledge_repository import knowledge_repository
from app.repositories.task_repository import task_repository
from app.schemas.common import ApiResponse
from app.schemas.course import (
    CourseCreate,
    CourseJoinRequest,
    CourseJoinResponse,
    CourseListResponse,
    CourseMemberListResponse,
    CourseRead,
    CourseUpdate,
)
from app.schemas.course_knowledge import (
    CourseFileListResponse,
    CourseFileRead,
    CourseKnowledgeAsyncIngestResponse,
    CourseKnowledgeCopyResponse,
    CourseKnowledgeDeleteResponse,
    CourseKnowledgeDocumentCreate,
    CourseKnowledgeDocumentListResponse,
    CourseKnowledgeDocumentRead,
    CourseKnowledgeIngestResponse,
    CourseKnowledgeRetrieveRequest,
    CourseKnowledgeRetrieveResponse,
    CourseKnowledgeRetrieveResult,
)
from app.schemas.course_assignment import (
    CourseAssignmentCreate,
    CourseAssignmentListResponse,
    CourseAssignmentRead,
    CourseAssignmentStartResponse,
    CourseAssignmentSubmissionListResponse,
    CourseAssignmentSubmissionRead,
    CourseAssignmentSubmitRequest,
    CourseAssignmentSubmitResponse,
    CourseAssignmentSummary,
    CourseTeachingDiagnostics,
    CourseWeakTopicStat,
)
from app.services.agents.test_agent import test_agent
from app.services.course_service import course_service
from app.services.documents.storage import clone_stored_file
from app.services.documents.storage import delete_file as delete_stored_file
from app.services.documents.storage import save_upload_file
from app.services.quality_analysis_service import quality_analysis_service
from app.services.profile_update_service import profile_update_service
from app.services.generation.reference_context_service import ReferenceContext
from app.services.rag.chroma_store import ChromaStoreError
from app.services.rag.chroma_store import delete_by_document_id as delete_chroma_by_document_id
from app.services.rag.ingestion import clone_ingested_document, ingest_document
from app.services.rag.retriever import retrieve
from app.tasks.knowledge_tasks import run_knowledge_ingest_task
from app.utils.response import success_response

router = APIRouter()


def _course_owner_id(course: Course, current_user: User) -> int:
    return int(course.owner_id or current_user.id)


def _assert_can_view_course(db: Session, course: Course, current_user: User) -> None:
    if not course_service.can_view_course(db, course, current_user):
        raise ForbiddenException("无权访问该课程")


def _assert_can_manage_course(course: Course, current_user: User) -> None:
    if not course_service.can_manage_course(course, current_user):
        raise ForbiddenException("无权管理该课程")


def _course_file_to_read(file_asset: FileAsset) -> CourseFileRead:
    return CourseFileRead(
        id=file_asset.id,
        original_filename=file_asset.original_filename,
        content_type=file_asset.content_type,
        file_size=file_asset.file_size,
        asset_type=file_asset.asset_type,
        parse_status=file_asset.parse_status,
        created_at=file_asset.created_at,
        updated_at=file_asset.updated_at,
        usable_for_course_knowledge=True,
    )


def _course_document_to_read(
    document: KnowledgeDocument,
    *,
    course_id: int,
    ingest_task_id: int | None = None,
    personal_copy: KnowledgeDocument | None = None,
) -> CourseKnowledgeDocumentRead:
    file_asset = document.file_asset
    owner = document.owner
    return CourseKnowledgeDocumentRead(
        id=document.id,
        title=document.title,
        file_id=document.file_asset_id,
        filename=file_asset.original_filename if file_asset is not None else None,
        status=document.status,
        chunk_count=document.chunk_count,
        created_at=document.created_at,
        updated_at=document.updated_at,
        owner_name=(owner.full_name or owner.username) if owner is not None else None,
        course_id=course_id,
        ingest_task_id=ingest_task_id,
        added_to_personal=personal_copy is not None,
        personal_document_id=personal_copy.id if personal_copy is not None else None,
        personal_document_status=personal_copy.status if personal_copy is not None else None,
    )


def _get_course_document_or_404(db: Session, *, course_id: int, document_id: int) -> KnowledgeDocument:
    document = knowledge_repository.get_document(db, document_id)
    if document is None or document.course_id != course_id:
        raise NotFoundException("Course knowledge document not found")
    return document


def _enqueue_course_document_ingestion(
    db: Session,
    *,
    document: KnowledgeDocument,
    file_asset: FileAsset,
):
    task = task_repository.create_task(
        db,
        owner_id=document.owner_id,
        task_type="knowledge_ingest",
        input_payload={
            "document_id": document.id,
            "file_asset_id": file_asset.id,
            "owner_id": document.owner_id,
            "course_id": document.course_id,
            "title": document.title,
            "source_type": document.source_type,
            "original_filename": file_asset.original_filename,
        },
    )
    knowledge_repository.update_document_status(
        db,
        document_id=document.id,
        status=KnowledgeDocumentStatus.parsing,
    )
    try:
        if get_settings().use_celery:
            run_knowledge_ingest_task.apply_async(args=[task.id])
        else:
            task_repository.update_task_status(db, task=task, status="running", progress=20)
            chunk_count = ingest_document(db, document=document, file_asset=file_asset)
            task_repository.mark_task_success(
                db,
                task=task,
                result_payload={
                    "document_id": document.id,
                    "chunk_count": chunk_count,
                    "status": "success",
                },
            )
    except Exception as exc:
        task_repository.mark_task_failed(db, task=task, error_message=f"{exc.__class__.__name__}: {exc}")
        knowledge_repository.update_document_status(
            db,
            document_id=document.id,
            status=KnowledgeDocumentStatus.failed,
        )
        raise AppException(
            "课程知识库入库任务启动失败",
            code=50301 if get_settings().use_celery else 50020,
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
                if get_settings().use_celery
                else status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=str(exc) or exc.__class__.__name__,
        ) from exc
    return task_repository.get_task_by_id(db, task.id) or task


def _validate_course_document_ids(db: Session, *, course_id: int, document_ids: list[int]) -> list[KnowledgeDocument]:
    unique_ids = list(dict.fromkeys(document_ids))
    if any(document_id <= 0 for document_id in unique_ids):
        raise BadRequestException("document_ids must be positive integers")

    documents: list[KnowledgeDocument] = []
    for document_id in unique_ids:
        document = knowledge_repository.get_document(db, document_id)
        if document is None or document.course_id != course_id:
            raise BadRequestException("All document_ids must belong to the current course")
        if document.status != KnowledgeDocumentStatus.ingested or document.chunk_count <= 0:
            raise BadRequestException(f"课程知识库文档“{document.title}”尚未入库完成，暂不能用于出题")
        documents.append(document)
    return documents


def _get_assignment_or_404(db: Session, *, course_id: int, assignment_id: int) -> CourseAssignment:
    assignment = course_assignment_repository.get_by_course(db, course_id=course_id, assignment_id=assignment_id)
    if assignment is None:
        raise NotFoundException("课程作业/测试不存在")
    return assignment


def _assert_assignment_visible(
    db: Session,
    course: Course,
    assignment: CourseAssignment,
    current_user: User,
) -> None:
    if course_service.can_manage_course(course, current_user):
        return
    _assert_can_view_course(db, course, current_user)
    if assignment.status not in {"published", "closed"}:
        raise ForbiddenException("该课程作业/测试尚未发布")


def _assert_can_take_assignment(db: Session, course: Course, current_user: User) -> None:
    _assert_can_view_course(db, course, current_user)
    if current_user.role not in {UserRole.student, UserRole.admin}:
        raise ForbiddenException("只有课程学生可以提交作业/测试")


def _normalized_submission_diagnostics(
    submission: CourseAssignmentSubmission,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    feedback = dict(submission.feedback or {})
    assignment = submission.assignment
    if assignment is None:
        return feedback, [dict(item) for item in submission.question_results or []]
    questions = {str(item.get("id")): item for item in assignment.questions or []}
    answers = assignment.answer_key or {}
    correct_topics: list[str] = []
    incorrect_topics: list[str] = []
    results: list[dict[str, Any]] = []
    for raw_result in submission.question_results or []:
        result = dict(raw_result)
        question_id = str(result.get("question_id") or "")
        question = questions.get(question_id) or {}
        answer_detail = answers.get(question_id) if isinstance(answers.get(question_id), dict) else {}
        topics = test_agent.diagnostic_topics(question, answer_detail)
        result["knowledge_points"] = topics
        results.append(result)
        (correct_topics if result.get("is_correct") else incorrect_topics).extend(topics)
    feedback["incorrect_topics"] = list(dict.fromkeys(incorrect_topics))
    weak_topic_set = set(feedback["incorrect_topics"])
    feedback["correct_topics"] = [
        topic for topic in dict.fromkeys(correct_topics) if topic not in weak_topic_set
    ]
    feedback["feedback"] = test_agent.feedback_for_score(
        float(submission.score or 0),
        feedback["incorrect_topics"],
    )
    feedback["recommendations"] = [feedback["feedback"]]
    return feedback, results


def _submission_to_read(db: Session, submission: CourseAssignmentSubmission) -> CourseAssignmentSubmissionRead:
    student = submission.student
    feedback, question_results = _normalized_submission_diagnostics(submission)
    if submission.assignment is not None and any(not item.get("knowledge_evidence") for item in question_results):
        enriched = _enrich_grade_with_course_evidence(
            db,
            assignment=submission.assignment,
            grade={
                "question_results": question_results,
                "correct_topics": feedback.get("correct_topics") or [],
                "incorrect_topics": feedback.get("incorrect_topics") or [],
            },
        )
        question_results = enriched["question_results"]
    quality_analysis = feedback.get("quality_analysis") if isinstance(feedback, dict) else None
    if quality_analysis is None or not quality_analysis.get("evidence_available", False):
        quality_analysis = _existing_submission_quality_analysis(db, submission)
    return CourseAssignmentSubmissionRead(
        id=submission.id,
        assignment_id=submission.assignment_id,
        course_id=submission.course_id,
        student_id=submission.student_id,
        student_username=student.username if student is not None else None,
        student_full_name=student.full_name if student is not None else None,
        status=submission.status,
        answers=submission.answers or {},
        score=submission.score,
        max_score=submission.max_score,
        feedback=feedback,
        question_results=question_results,
        quality_analysis=quality_analysis,
        started_at=submission.started_at,
        submitted_at=submission.submitted_at,
        graded_at=submission.graded_at,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
    )


def _current_submission(
    db: Session,
    assignment: CourseAssignment,
    current_user: User,
) -> CourseAssignmentSubmission | None:
    if current_user.role not in {UserRole.student, UserRole.admin}:
        return None
    return course_assignment_repository.get_submission(db, assignment_id=assignment.id, student_id=current_user.id)


def _assignment_summary(
    db: Session,
    assignment: CourseAssignment,
    current_user: User,
    *,
    include_submission_count: bool,
) -> CourseAssignmentSummary:
    submission = _current_submission(db, assignment, current_user)
    return CourseAssignmentSummary(
        id=assignment.id,
        course_id=assignment.course_id,
        title=assignment.title,
        description=assignment.description,
        assignment_type=assignment.assignment_type,
        source=assignment.source,
        difficulty=assignment.difficulty,
        topic=assignment.topic,
        question_count=assignment.question_count,
        total_score=assignment.total_score,
        time_limit_minutes=assignment.time_limit_minutes,
        due_at=assignment.due_at,
        status=assignment.status,
        published_at=assignment.published_at,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
        submitted_count=course_assignment_repository.count_submissions(db, assignment.id) if include_submission_count else None,
        current_student_submission_status=submission.status if submission is not None else None,
        current_student_score=submission.score if submission is not None else None,
    )


def _can_include_assignment_answers(
    db: Session,
    course: Course,
    assignment: CourseAssignment,
    current_user: User,
) -> bool:
    if course_service.can_manage_course(course, current_user):
        return True
    submission = _current_submission(db, assignment, current_user)
    return submission is not None and submission.status in {"submitted", "graded"}


def _assignment_read(
    db: Session,
    course: Course,
    assignment: CourseAssignment,
    current_user: User,
) -> CourseAssignmentRead:
    can_manage = course_service.can_manage_course(course, current_user)
    include_answers = _can_include_assignment_answers(db, course, assignment, current_user)
    submission = _current_submission(db, assignment, current_user)
    summary = _assignment_summary(
        db,
        assignment,
        current_user,
        include_submission_count=can_manage,
    )
    return CourseAssignmentRead(
        **summary.model_dump(),
        knowledge_document_ids=[int(item) for item in assignment.knowledge_document_ids or []],
        questions=assignment.questions or [],
        answer_key=assignment.answer_key if include_answers else None,
        explanations=assignment.explanations if include_answers else {},
        current_student_submission=_submission_to_read(db, submission) if submission is not None else None,
        submissions_total=course_assignment_repository.count_submissions(db, assignment.id) if can_manage else None,
        quality_analysis=_assignment_quality_analysis(db, assignment),
    )


def _assignment_quality_analysis(db: Session, assignment: CourseAssignment):
    reference_context = _course_assignment_reference_context(
        db,
        course_id=assignment.course_id,
        document_ids=[int(item) for item in assignment.knowledge_document_ids or []],
    )
    return quality_analysis_service.analyze_generated_content(
        content={
            "questions": assignment.questions or [],
            "answer_key": assignment.answer_key or {},
            "explanations": assignment.explanations or {},
        },
        request_payload={
            "title": assignment.title,
            "description": assignment.description,
            "assignment_type": assignment.assignment_type,
            "topic": assignment.topic,
            "difficulty": assignment.difficulty,
            "question_count": assignment.question_count,
            "knowledge_document_ids": [int(item) for item in assignment.knowledge_document_ids or []],
        },
        references=reference_context.references,
        warnings=reference_context.warnings,
        difficulty=assignment.difficulty,
        context_label=assignment.title,
    )


def _submission_quality_analysis(
    *,
    db: Session,
    assignment: CourseAssignment,
    grade: dict[str, Any],
) -> dict[str, Any]:
    reference_context = _course_assignment_reference_context(
        db,
        course_id=assignment.course_id,
        document_ids=[int(item) for item in assignment.knowledge_document_ids or []],
        top_k_per_document=10,
    )
    analysis = quality_analysis_service.analyze_generated_content(
        content={
            "analysis": grade.get("analysis"),
            "feedback": grade.get("feedback"),
            "question_results": grade.get("question_results") or [],
        },
        request_payload={
            "title": assignment.title,
            "topic": assignment.topic,
            "difficulty": assignment.difficulty,
            "question_count": assignment.question_count,
            "correct_topics": grade.get("correct_topics") or [],
            "incorrect_topics": grade.get("incorrect_topics") or [],
        },
        expected_keywords=[str(item) for item in (grade.get("incorrect_topics") or grade.get("correct_topics") or [])],
        references=reference_context.references,
        warnings=reference_context.warnings,
        difficulty=assignment.difficulty,
        context_label="作业提交结果",
    )
    return analysis.model_dump(mode="json")


def _existing_submission_quality_analysis(db: Session, submission: CourseAssignmentSubmission) -> dict[str, Any] | None:
    assignment = submission.assignment
    if assignment is None or submission.status not in {"submitted", "graded"}:
        return None
    feedback, question_results = _normalized_submission_diagnostics(submission)
    reference_context = _course_assignment_reference_context(
        db,
        course_id=assignment.course_id,
        document_ids=[int(item) for item in assignment.knowledge_document_ids or []],
        top_k_per_document=10,
    )
    return quality_analysis_service.analyze_generated_content(
        content={
            "feedback": feedback,
            "question_results": question_results,
            "score": submission.score,
        },
        request_payload={
            "title": assignment.title,
            "topic": assignment.topic,
            "difficulty": assignment.difficulty,
            "question_count": assignment.question_count,
            "correct_topics": feedback.get("correct_topics") if isinstance(feedback, dict) else [],
            "incorrect_topics": feedback.get("incorrect_topics") if isinstance(feedback, dict) else [],
        },
        expected_keywords=[
            str(item)
            for item in (
                (feedback.get("incorrect_topics") or feedback.get("correct_topics") or [])
                if isinstance(feedback, dict)
                else []
            )
        ],
        references=reference_context.references,
        warnings=reference_context.warnings,
        difficulty=assignment.difficulty,
        context_label="作业提交结果",
    ).model_dump(mode="json")


def _course_teaching_diagnostics(
    submissions: list[CourseAssignmentSubmission],
    *,
    assignment: CourseAssignment | None = None,
) -> CourseTeachingDiagnostics:
    graded = [item for item in submissions if item.status in {"submitted", "graded"} and item.score is not None]
    if not graded:
        return CourseTeachingDiagnostics()

    weak_counter: Counter[str] = Counter()
    strong_counter: Counter[str] = Counter()
    weak_students: defaultdict[str, set[int]] = defaultdict(set)
    weak_question_evidence: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    score_rates: list[float] = []
    scores: list[float] = []
    for submission in graded:
        feedback, results = _normalized_submission_diagnostics(submission)
        weak_topics = [str(item).strip() for item in feedback.get("incorrect_topics") or [] if str(item).strip()]
        strong_topics = [str(item).strip() for item in feedback.get("correct_topics") or [] if str(item).strip()]
        weak_counter.update(weak_topics)
        strong_counter.update(strong_topics)
        for topic in set(weak_topics):
            weak_students[topic].add(int(submission.student_id))
        question_map = {
            str(item.get("id")): item
            for item in ((submission.assignment.questions if submission.assignment is not None else []) or [])
        }
        answer_map = submission.assignment.answer_key if submission.assignment is not None else {}
        for result in results:
            if result.get("is_correct"):
                continue
            question_id = str(result.get("question_id") or "")
            question = question_map.get(question_id) or {}
            answer_detail = (answer_map or {}).get(question_id) or {}
            evidence = {
                "question_id": question_id,
                "question_type": result.get("question_type") or question.get("question_type"),
                "stem": str(question.get("stem") or "")[:300],
                "student_answer": result.get("user_answer"),
                "correct_answer": result.get("correct_answer", answer_detail.get("answer")),
                "explanation": str(result.get("analysis") or answer_detail.get("analysis") or "")[:400],
            }
            for topic in result.get("knowledge_points") or []:
                topic_label = str(topic).strip()
                if topic_label and len(weak_question_evidence[topic_label]) < 12:
                    weak_question_evidence[topic_label].append(evidence)
        score = float(submission.score or 0)
        maximum = max(1.0, float(submission.max_score or 100))
        scores.append(score)
        score_rates.append(score / maximum)

    submitted_count = len(graded)
    average_score = round(sum(scores) / submitted_count, 2)
    average_rate = round(sum(score_rates) / submitted_count, 4)
    weak_stats = [
        CourseWeakTopicStat(
            topic=topic,
            student_count=len(weak_students[topic]),
            occurrence_count=count,
            rate=round(len(weak_students[topic]) / submitted_count, 4),
        )
        for topic, count in weak_counter.most_common(8)
    ]
    if average_rate >= 0.85:
        evaluation = f"已提交学生平均达成率为 {average_rate:.0%}，整体掌握较好，可转入综合应用与迁移训练。"
    elif average_rate >= 0.70:
        evaluation = f"已提交学生平均达成率为 {average_rate:.0%}，基础目标基本达成，但仍需针对高频失分点进行巩固。"
    elif average_rate >= 0.60:
        evaluation = f"已提交学生平均达成率为 {average_rate:.0%}，掌握程度一般，建议放慢新内容进度并安排纠错课。"
    else:
        evaluation = f"已提交学生平均达成率为 {average_rate:.0%}，整体掌握不足，建议优先回讲核心概念并进行分层补救。"

    fallback_focus: list[str] = []
    for item in weak_stats[:5]:
        scope = "全班回讲" if item.rate >= 0.5 else "分组辅导"
        evidence_items = weak_question_evidence.get(item.topic) or []
        question_types = {str(value.get("question_type") or "") for value in evidence_items}
        if "multiple_choice" in question_types:
            method = "用选项对比表梳理易混概念的边界，让学生逐项说明保留或排除理由，最后用一道同概念多选题检查是否能识别全部必要条件"
        elif "short_answer" in question_types:
            method = "依据标准答案拆出核心关键词与逻辑关系，组织学生补全答案结构并互评缺失要点，最后用一分钟书面作答检查表达完整度"
        elif "true_false" in question_types:
            method = "围绕命题成立条件设计正例与反例，让学生标注决定真假的限定词，再用条件发生变化的判断题检验概念边界"
        elif "single_choice" in question_types:
            method = "把高频误选项与正确选项并列比较，追问各选项对应的概念依据，并通过更换情境但保持考点不变的选择题进行即时检验"
        else:
            method = "从本次错误答案中提取混淆点，使用概念关系图讲清关键联系，并安排针对该薄弱点的当堂短答作为出口检测"
        fallback_focus.append(f"{scope}“{item.topic}”：{method}。")
    if not fallback_focus:
        fallback_focus.append("当前提交未形成集中薄弱点，可增加综合情境题，重点观察知识迁移与表达完整性。")

    diagnostic_context = {
        "assignment": {
            "title": assignment.title if assignment is not None else None,
            "topic": assignment.topic if assignment is not None else None,
            "difficulty": assignment.difficulty if assignment is not None else None,
        },
        "submitted_count": submitted_count,
        "average_score": average_score,
        "average_achievement_rate": average_rate,
        "weak_topics": [
            {
                "topic": item.topic,
                "student_count": item.student_count,
                "occurrence_count": item.occurrence_count,
                "rate": item.rate,
                "wrong_answer_evidence": weak_question_evidence.get(item.topic) or [],
            }
            for item in weak_stats[:5]
        ],
    }
    teaching_focus = test_agent.summarize_teaching_focus(
        diagnostic_context=diagnostic_context,
        fallback=fallback_focus,
    )

    return CourseTeachingDiagnostics(
        submitted_count=submitted_count,
        average_score=average_score,
        average_score_rate=average_rate,
        weak_topics=weak_stats,
        strong_topics=[topic for topic, _count in strong_counter.most_common(8)],
        evaluation=evaluation,
        teaching_focus=teaching_focus,
    )


def _score_questions(questions: list[dict[str, Any]], total_score: float) -> list[dict[str, Any]]:
    if not questions:
        return questions
    base = round(float(total_score) / len(questions), 2)
    scores = [base for _ in questions]
    scores[-1] = round(float(total_score) - sum(scores[:-1]), 2)
    scored: list[dict[str, Any]] = []
    for question, score_value in zip(questions, scores, strict=False):
        next_question = dict(question)
        next_question["score"] = score_value
        scored.append(next_question)
    return scored


def _assignment_knowledge_points(
    db: Session,
    *,
    topic: str,
    documents: list[KnowledgeDocument],
) -> list[str]:
    points = [topic]
    for document in documents:
        points.append(document.title)
        chunks = knowledge_repository.list_chunks_by_document(db, document.id)
        if chunks:
            snippet = " ".join(chunks[0].content.split())[:80]
            if snippet:
                points.append(snippet)
    return [item for item in dict.fromkeys(points) if item]


def _course_assignment_reference_context(
    db: Session,
    *,
    course_id: int,
    document_ids: list[int],
    top_k_per_document: int = 5,
) -> ReferenceContext:
    references: list[dict[str, Any]] = []
    warnings: list[str] = []
    sections: list[str] = []
    source_document_ids: list[int] = []
    source_chunk_ids: list[int] = []
    for document_id in list(dict.fromkeys(document_ids)):
        document = knowledge_repository.get_document(db, document_id)
        if document is None or document.course_id != course_id:
            warnings.append(f"课程知识库文档 {document_id} 不存在或不属于当前课程")
            continue
        if document.status != KnowledgeDocumentStatus.ingested:
            warnings.append(f"课程知识库文档“{document.title}”尚未入库完成")
            continue
        chunks = knowledge_repository.list_chunks_by_document(db, document.id)[:max(1, top_k_per_document)]
        if not chunks:
            warnings.append(f"课程知识库文档“{document.title}”没有可用分块")
            continue
        source_document_ids.append(document.id)
        filename = document.file_asset.original_filename if document.file_asset is not None else document.title
        for chunk in chunks:
            source_chunk_ids.append(chunk.id)
            reference = {
                "source_type": "course_knowledge",
                "knowledge_document_id": document.id,
                "document_id": document.id,
                "file_id": document.file_asset_id,
                "chunk_id": chunk.id,
                "source_filename": filename,
                "excerpt": chunk.content,
                "reference_text": chunk.content,
            }
            references.append(reference)
            sections.append(f"[document:{document.id} chunk:{chunk.id} {filename}]\n{chunk.content}")
    return ReferenceContext(
        text="\n\n".join(sections),
        references=references,
        warnings=warnings,
        evidence_snapshot={
            "source_document_ids": source_document_ids,
            "source_chunk_ids": source_chunk_ids,
            "references": references,
            "warnings": warnings,
        },
    )


def _enrich_grade_with_course_evidence(
    db: Session,
    *,
    assignment: CourseAssignment,
    grade: dict[str, Any],
) -> dict[str, Any]:
    """Attach the concrete course chunks used to justify each graded answer."""
    reference_context = _course_assignment_reference_context(
        db,
        course_id=assignment.course_id,
        document_ids=[int(item) for item in assignment.knowledge_document_ids or []],
        top_k_per_document=20,
    )
    questions = {str(item.get("id")): item for item in assignment.questions or []}
    answer_key = assignment.answer_key or {}
    enriched_results: list[dict[str, Any]] = []
    for raw_result in grade.get("question_results") or []:
        result = dict(raw_result)
        question_id = str(result.get("question_id") or "")
        question = questions.get(question_id) or {}
        answer_detail = answer_key.get(question_id) if isinstance(answer_key.get(question_id), dict) else {}
        terms = [
            *[str(item).strip() for item in result.get("knowledge_points") or []],
            *[str(item).strip() for item in answer_detail.get("keywords") or []],
        ]
        query_text = " ".join([str(question.get("stem") or ""), *terms]).lower()

        ranked: list[tuple[int, dict[str, Any]]] = []
        for reference in reference_context.references:
            excerpt = str(reference.get("excerpt") or reference.get("reference_text") or "")
            lowered = excerpt.lower()
            relevance = sum(3 for term in terms if len(term) >= 2 and term.lower() in lowered)
            relevance += sum(1 for token in query_text.split() if len(token) >= 3 and token in lowered)
            ranked.append((relevance, reference))
        ranked.sort(key=lambda item: item[0], reverse=True)
        selected = [item[1] for item in ranked if item[0] > 0][:2]
        if not selected and ranked:
            selected = [ranked[0][1]]
        result["knowledge_evidence"] = [
            {
                "document_id": reference.get("knowledge_document_id") or reference.get("document_id"),
                "chunk_id": reference.get("chunk_id"),
                "source_filename": reference.get("source_filename"),
                "excerpt": str(reference.get("excerpt") or "")[:320],
            }
            for reference in selected
        ]
        result["grading_basis"] = (
            "依据课程知识库生成的标准答案、解析与关键词进行判分。"
            if reference_context.references
            else "本题未关联可用课程知识库证据，依据已保存标准答案进行判分。"
        )
        enriched_results.append(result)
    grade["question_results"] = enriched_results
    grade["evidence_references"] = reference_context.references
    grade["evidence_warnings"] = reference_context.warnings
    return grade


def _explanations_from_answer_key(answer_key: dict[str, Any]) -> dict[str, Any]:
    return {
        question_id: answer.get("analysis")
        for question_id, answer in answer_key.items()
        if isinstance(answer, dict) and answer.get("analysis")
    }


def _enrich_retrieve_results(
    *,
    raw_results: list[dict],
    documents_by_id: dict[int, KnowledgeDocument],
) -> list[CourseKnowledgeRetrieveResult]:
    enriched: list[CourseKnowledgeRetrieveResult] = []
    for result in raw_results:
        metadata = result.get("metadata") or {}
        document_id_raw = metadata.get("document_id")
        document_id = int(document_id_raw) if document_id_raw is not None else None
        document = documents_by_id.get(document_id) if document_id is not None else None
        file_asset = document.file_asset if document is not None else None
        enriched.append(
            CourseKnowledgeRetrieveResult(
                content=str(result.get("content") or ""),
                metadata=metadata,
                score=result.get("score"),
                document_id=document_id,
                title=document.title if document is not None else None,
                filename=file_asset.original_filename if file_asset is not None else metadata.get("source_filename"),
            )
        )
    return enriched


@router.post(
    "",
    response_model=ApiResponse[CourseRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create course",
)
def create_course(
    payload: CourseCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    data = course_service.create_course(db, payload, current_user)
    return success_response(data=data, request=request)


@router.get("/my", response_model=ApiResponse[CourseListResponse], summary="List my courses")
def list_my_courses(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = course_service.list_my_courses(db, current_user, page, page_size)
    return success_response(data=data, request=request)


@router.post("/join", response_model=ApiResponse[CourseJoinResponse], summary="Join course by code")
def join_course(
    payload: CourseJoinRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = course_service.join_course(db, payload.code, current_user)
    return success_response(data=data, request=request)


@router.get("/{course_id}", response_model=ApiResponse[CourseRead], summary="Get course detail")
def get_course(
    course_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = course_service.get_course_detail(db, course_id, current_user)
    return success_response(data=data, request=request)


@router.patch("/{course_id}", response_model=ApiResponse[CourseRead], summary="Update course")
def update_course(
    course_id: int,
    payload: CourseUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = course_service.update_course(db, course_id, payload, current_user)
    return success_response(data=data, request=request)


@router.post("/{course_id}/archive", response_model=ApiResponse[CourseRead], summary="Archive course")
def archive_course(
    course_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = course_service.archive_course(db, course_id, current_user)
    return success_response(data=data, request=request)


@router.get(
    "/{course_id}/members",
    response_model=ApiResponse[CourseMemberListResponse],
    summary="List course members",
)
def list_course_members(
    course_id: int,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = course_service.list_members(db, course_id, current_user, page, page_size)
    return success_response(data=data, request=request)


@router.get(
    "/{course_id}/files",
    response_model=ApiResponse[CourseFileListResponse],
    summary="List uploaded files usable for course knowledge",
)
def list_course_files(
    course_id: int,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)

    files_owner_id = _course_owner_id(course, current_user)
    items, total = file_repository.list_by_owner(db, owner_id=files_owner_id, page=page, page_size=page_size)
    return success_response(
        data=CourseFileListResponse(items=[_course_file_to_read(item) for item in items], total=total),
        request=request,
    )


@router.post(
    "/{course_id}/files/upload",
    response_model=ApiResponse[CourseFileRead],
    summary="Upload a course material file",
)
async def upload_course_file(
    course_id: int,
    request: Request,
    file: UploadFile = File(...),
    asset_type: str = Form(default="course_material"),
    description: str | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    _ = description
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)
    _validate_upload(file)

    settings = get_settings()
    try:
        stored_file = await save_upload_file(file, max_size_bytes=settings.max_upload_size_bytes)
    except ValueError as exc:
        raise BadRequestException(str(exc)) from exc

    if stored_file.file_size <= 0:
        delete_stored_file(stored_file.storage_path)
        raise BadRequestException("上传文件不能为空")

    try:
        file_asset = file_repository.create_file_asset(
            db,
            owner_id=current_user.id,
            original_filename=stored_file.original_filename,
            storage_path=stored_file.storage_path,
            content_type=stored_file.content_type,
            file_size=stored_file.file_size,
            file_hash=stored_file.file_hash,
            asset_type=asset_type or "course_material",
            parse_status=FileParseStatus.pending,
        )
    except Exception:
        delete_stored_file(stored_file.storage_path)
        raise

    return success_response(data=_course_file_to_read(file_asset), request=request)


@router.get(
    "/{course_id}/knowledge/documents",
    response_model=ApiResponse[CourseKnowledgeDocumentListResponse],
    summary="List course knowledge documents",
)
def list_course_knowledge_documents(
    course_id: int,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_view_course(db, course, current_user)

    items, total = knowledge_repository.list_documents(
        db,
        include_all=True,
        course_id=course_id,
        page=page,
        page_size=page_size,
    )
    personal_copies = knowledge_repository.list_personal_copies(
        db,
        owner_id=current_user.id,
        source_document_ids=[item.id for item in items],
    )
    data = CourseKnowledgeDocumentListResponse(
        items=[
            _course_document_to_read(
                item,
                course_id=course_id,
                personal_copy=personal_copies.get(item.id),
            )
            for item in items
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.post(
    "/{course_id}/knowledge/documents/{document_id}/copy-to-personal",
    response_model=ApiResponse[CourseKnowledgeCopyResponse],
    summary="Copy a ready course knowledge document into the current user's private knowledge base",
)
def copy_course_knowledge_to_personal(
    course_id: int,
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_view_course(db, course, current_user)
    source_document = _get_course_document_or_404(db, course_id=course_id, document_id=document_id)
    if source_document.status != KnowledgeDocumentStatus.ingested or source_document.chunk_count <= 0:
        raise BadRequestException("只有已入库的课程资料可以加入个人知识库")
    if source_document.file_asset_id is None:
        raise BadRequestException("课程知识库文档没有可复制的来源文件")

    existing = knowledge_repository.get_personal_copy(
        db,
        owner_id=current_user.id,
        source_document_id=source_document.id,
    )
    if existing is not None:
        return success_response(
            data=CourseKnowledgeCopyResponse(
                source_document_id=source_document.id,
                personal_document_id=existing.id,
                personal_file_id=existing.file_asset_id,
                status=existing.status,
                chunk_count=existing.chunk_count,
                already_added=True,
            ),
            request=request,
        )

    source_file = file_repository.get_by_id(db, source_document.file_asset_id)
    if source_file is None:
        raise NotFoundException("课程资料来源文件不存在")
    cloned_storage = clone_stored_file(
        source_file.storage_path,
        original_filename=source_file.original_filename,
        content_type=source_file.content_type,
    )
    try:
        personal_file = file_repository.create_file_asset(
            db,
            owner_id=current_user.id,
            original_filename=cloned_storage.original_filename,
            storage_path=cloned_storage.storage_path,
            content_type=cloned_storage.content_type,
            file_size=cloned_storage.file_size,
            file_hash=cloned_storage.file_hash,
            asset_type="personal_knowledge_copy",
            parse_status=FileParseStatus.parsed,
        )
    except Exception:
        delete_stored_file(cloned_storage.storage_path)
        raise
    personal_document = knowledge_repository.create_document(
        db,
        owner_id=current_user.id,
        file_asset_id=personal_file.id,
        title=source_document.title,
        source_type=f"course_copy:{source_document.id}",
        course_id=None,
        status=KnowledgeDocumentStatus.pending,
    )
    chunk_count = clone_ingested_document(
        db,
        source_document=source_document,
        target_document=personal_document,
        target_file_asset=personal_file,
    )

    return success_response(
        data=CourseKnowledgeCopyResponse(
            source_document_id=source_document.id,
            personal_document_id=personal_document.id,
            personal_file_id=personal_file.id,
            status=KnowledgeDocumentStatus.ingested,
            chunk_count=chunk_count,
            already_added=False,
        ),
        request=request,
    )


@router.post(
    "/{course_id}/knowledge/documents",
    response_model=ApiResponse[CourseKnowledgeDocumentRead],
    summary="Create a course knowledge document from an uploaded file",
)
def create_course_knowledge_document(
    course_id: int,
    payload: CourseKnowledgeDocumentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)

    file_asset = file_repository.get_by_id(db, payload.file_id)
    if file_asset is None:
        raise NotFoundException("文件不存在")
    if not file_repository.check_owner_or_admin(file_asset, current_user):
        raise ForbiddenException("无权使用该文件")

    title = (payload.title or "").strip() or Path(file_asset.original_filename).stem
    document = knowledge_repository.get_document_by_file_course(
        db,
        file_asset_id=file_asset.id,
        course_id=course_id,
    )
    if document is None:
        document = knowledge_repository.create_document(
            db,
            owner_id=_course_owner_id(course, current_user),
            file_asset_id=file_asset.id,
            title=title,
            source_type="course_file",
            course_id=course_id,
            status=KnowledgeDocumentStatus.pending,
        )

    task_id = None
    if document.status in {KnowledgeDocumentStatus.pending, KnowledgeDocumentStatus.failed} or (
        document.status == KnowledgeDocumentStatus.ingested and document.chunk_count <= 0
    ):
        task = _enqueue_course_document_ingestion(db, document=document, file_asset=file_asset)
        task_id = task.id
    refreshed = knowledge_repository.get_document(db, document.id) or document
    return success_response(
        data=_course_document_to_read(refreshed, course_id=course_id, ingest_task_id=task_id),
        request=request,
    )


@router.post(
    "/{course_id}/knowledge/documents/{document_id}/ingest",
    response_model=ApiResponse[CourseKnowledgeIngestResponse],
    summary="Synchronously ingest a course knowledge document",
)
def ingest_course_knowledge_document(
    course_id: int,
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)
    document = _get_course_document_or_404(db, course_id=course_id, document_id=document_id)
    if document.file_asset_id is None:
        raise BadRequestException("知识库文档没有来源文件")
    file_asset = file_repository.get_by_id(db, document.file_asset_id)
    if file_asset is None:
        raise NotFoundException("来源文件不存在")

    try:
        chunk_count = ingest_document(db, document=document, file_asset=file_asset)
    except Exception as exc:
        raise AppException(
            "知识库入库失败",
            code=50020,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    refreshed_document = knowledge_repository.get_document(db, document_id)
    data = CourseKnowledgeIngestResponse(
        document_id=document_id,
        status=refreshed_document.status if refreshed_document else KnowledgeDocumentStatus.ingested,
        chunk_count=chunk_count,
        chroma_collection=refreshed_document.chunks[0].chroma_collection
        if refreshed_document and refreshed_document.chunks
        else "edugenie_knowledge",
    )
    return success_response(data=data, request=request)


@router.post(
    "/{course_id}/knowledge/documents/{document_id}/ingest-async",
    response_model=ApiResponse[CourseKnowledgeAsyncIngestResponse],
    summary="Create an async task to ingest a course knowledge document",
)
def ingest_course_knowledge_document_async(
    course_id: int,
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)
    document = _get_course_document_or_404(db, course_id=course_id, document_id=document_id)
    if document.status == KnowledgeDocumentStatus.parsing:
        raise BadRequestException("知识库文档正在入库，请稍后再试")
    if document.file_asset_id is None:
        raise BadRequestException("知识库文档没有来源文件")

    file_asset = file_repository.get_by_id(db, document.file_asset_id)
    if file_asset is None:
        raise NotFoundException("来源文件不存在")

    task = _enqueue_course_document_ingestion(db, document=document, file_asset=file_asset)

    return success_response(
        data=CourseKnowledgeAsyncIngestResponse(
            task_id=task.id,
            task_type=task.task_type,
            status=task.status,
            polling_url=f"/api/v1/tasks/{task.id}",
            stream_url=f"/api/v1/tasks/{task.id}/stream",
        ),
        request=request,
    )


@router.post(
    "/{course_id}/knowledge/retrieve",
    response_model=ApiResponse[CourseKnowledgeRetrieveResponse],
    summary="Retrieve chunks from a course-scoped knowledge base",
)
def retrieve_course_knowledge(
    course_id: int,
    payload: CourseKnowledgeRetrieveRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_view_course(db, course, current_user)

    selected_documents = _validate_course_document_ids(
        db,
        course_id=course_id,
        document_ids=payload.document_ids or [],
    )
    documents_by_id: dict[int, KnowledgeDocument] = {document.id: document for document in selected_documents}

    try:
        if selected_documents:
            raw_results: list[dict] = []
            for document in selected_documents:
                raw_results.extend(
                    retrieve(
                        query=payload.query,
                        owner_id=document.owner_id,
                        course_id=course_id,
                        document_id=document.id,
                        top_k=payload.top_k,
                    )
                )
            raw_results = sorted(
                raw_results,
                key=lambda item: item.get("score") if item.get("score") is not None else float("inf"),
            )[: payload.top_k]
        else:
            course_documents, _ = knowledge_repository.list_documents(
                db,
                include_all=True,
                course_id=course_id,
                page=1,
                page_size=1000,
            )
            documents_by_id = {document.id: document for document in course_documents}
            raw_results = retrieve(
                query=payload.query,
                owner_id=_course_owner_id(course, current_user),
                course_id=course_id,
                top_k=payload.top_k,
            )
    except ChromaStoreError as exc:
        raise AppException(
            "知识库检索失败",
            code=50022,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    data = CourseKnowledgeRetrieveResponse(
        query=payload.query,
        results=_enrich_retrieve_results(raw_results=raw_results, documents_by_id=documents_by_id),
    )
    return success_response(data=data, request=request)


@router.post(
    "/{course_id}/assignments",
    response_model=ApiResponse[CourseAssignmentRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create and publish a course assignment or test",
)
def create_course_assignment(
    course_id: int,
    payload: CourseAssignmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)
    if course.status == "archived":
        raise BadRequestException("课程已归档，不能继续发布作业/测试")
    if payload.status not in {"draft", "published"}:
        raise BadRequestException("新建作业/测试只能保存为草稿或直接发布")
    if payload.generation_mode != "ai":
        raise BadRequestException("第一版课程作业/测试仅支持智能生成，请选择智能生成模式")

    selected_documents = _validate_course_document_ids(
        db,
        course_id=course_id,
        document_ids=payload.knowledge_document_ids,
    )
    topic = (payload.topic or payload.title).strip()
    reference_context = _course_assignment_reference_context(
        db,
        course_id=course_id,
        document_ids=[document.id for document in selected_documents],
    )
    questions, answer_key = test_agent.generate_test(
        topic=topic,
        difficulty=payload.difficulty,
        question_count=payload.question_count,
        question_types=payload.question_types,
        knowledge_points=_assignment_knowledge_points(db, topic=topic, documents=selected_documents),
        bank_questions=[],
        evidence_context=reference_context.text,
    )
    questions = _score_questions(questions, payload.total_score)
    assignment = course_assignment_repository.create_assignment(
        db,
        course_id=course_id,
        teacher_id=current_user.id,
        title=payload.title,
        description=payload.description,
        assignment_type=payload.assignment_type,
        source="ai_generated",
        difficulty=payload.difficulty,
        topic=topic,
        question_count=len(questions),
        total_score=payload.total_score,
        time_limit_minutes=payload.time_limit_minutes,
        due_at=payload.due_at,
        status=payload.status,
        knowledge_document_ids=[document.id for document in selected_documents],
        questions=questions,
        answer_key=answer_key,
        explanations=_explanations_from_answer_key(answer_key),
    )
    return success_response(data=_assignment_read(db, course, assignment, current_user), request=request)


@router.get(
    "/{course_id}/assignments",
    response_model=ApiResponse[CourseAssignmentListResponse],
    summary="List course assignments",
)
def list_course_assignments(
    course_id: int,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_view_course(db, course, current_user)
    can_manage = course_service.can_manage_course(course, current_user)
    statuses = None if can_manage else ["published", "closed"]
    items, total = course_assignment_repository.list_by_course(
        db,
        course_id=course_id,
        include_statuses=statuses,
        page=page,
        page_size=page_size,
    )
    data = CourseAssignmentListResponse(
        items=[_assignment_summary(db, item, current_user, include_submission_count=can_manage) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.get(
    "/{course_id}/assignments/{assignment_id}",
    response_model=ApiResponse[CourseAssignmentRead],
    summary="Get course assignment detail",
)
def get_course_assignment(
    course_id: int,
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    assignment = _get_assignment_or_404(db, course_id=course_id, assignment_id=assignment_id)
    _assert_assignment_visible(db, course, assignment, current_user)
    return success_response(data=_assignment_read(db, course, assignment, current_user), request=request)


@router.post(
    "/{course_id}/assignments/{assignment_id}/start",
    response_model=ApiResponse[CourseAssignmentStartResponse],
    summary="Start a course assignment as current student",
)
def start_course_assignment(
    course_id: int,
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    assignment = _get_assignment_or_404(db, course_id=course_id, assignment_id=assignment_id)
    _assert_can_take_assignment(db, course, current_user)
    if assignment.status != "published":
        if assignment.status == "closed":
            raise BadRequestException("该作业/测试已关闭，不能开始作答")
        raise ForbiddenException("该作业/测试尚未发布")

    submission = course_assignment_repository.ensure_submission(db, assignment=assignment, student_id=current_user.id)
    submission = course_assignment_repository.start_submission(db, submission)
    data = CourseAssignmentStartResponse(
        assignment=_assignment_read(db, course, assignment, current_user),
        submission=_submission_to_read(db, submission),
    )
    return success_response(data=data, request=request)


@router.post(
    "/{course_id}/assignments/{assignment_id}/submit",
    response_model=ApiResponse[CourseAssignmentSubmitResponse],
    summary="Submit current student's course assignment answers",
)
def submit_course_assignment(
    course_id: int,
    assignment_id: int,
    payload: CourseAssignmentSubmitRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    assignment = _get_assignment_or_404(db, course_id=course_id, assignment_id=assignment_id)
    _assert_can_take_assignment(db, course, current_user)
    if assignment.status != "published":
        raise BadRequestException("该作业/测试已关闭或尚未发布，不能继续提交")

    submission = course_assignment_repository.ensure_submission(db, assignment=assignment, student_id=current_user.id)
    if submission.status in {"submitted", "graded"}:
        raise BadRequestException("该作业/测试已经提交，不能重复提交")

    grade = test_agent.grade(
        questions=assignment.questions or [],
        answers=assignment.answer_key or {},
        user_answers=payload.answers,
    )
    grade = _enrich_grade_with_course_evidence(db, assignment=assignment, grade=grade)
    feedback = {
        "analysis": grade["analysis"],
        "feedback": grade["feedback"],
        "recommendations": [grade["feedback"]],
        "correct_topics": grade["correct_topics"],
        "incorrect_topics": grade["incorrect_topics"],
        "quality_analysis": _submission_quality_analysis(db=db, assignment=assignment, grade=grade),
    }
    submission = course_assignment_repository.submit_submission(
        db,
        submission=submission,
        answers=payload.answers,
        score=grade["score"],
        question_results=grade["question_results"],
        feedback=feedback,
    )
    profile_snapshot = profile_update_service.apply_course_assignment_result(
        db,
        user_id=current_user.id,
        submission_id=submission.id,
        assignment_id=assignment.id,
        course_id=course.id,
        course_name=course.name,
        score=grade["score"],
        correct_topics=grade["correct_topics"],
        incorrect_topics=grade["incorrect_topics"],
    )
    data = CourseAssignmentSubmitResponse(
        assignment_id=assignment.id,
        submission_id=submission.id,
        status=submission.status,
        score=grade["score"],
        max_score=submission.max_score,
        analysis=grade["analysis"],
        feedback=grade["feedback"],
        question_results=grade["question_results"],
        answer_key=assignment.answer_key or {},
        recommendations=[grade["feedback"]],
        quality_analysis=feedback["quality_analysis"],
        profile_snapshot=profile_snapshot,
    )
    return success_response(data=data, request=request)


@router.get(
    "/{course_id}/assignments/{assignment_id}/submissions",
    response_model=ApiResponse[CourseAssignmentSubmissionListResponse],
    summary="List submissions for a course assignment",
)
def list_course_assignment_submissions(
    course_id: int,
    assignment_id: int,
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)
    assignment = _get_assignment_or_404(db, course_id=course_id, assignment_id=assignment_id)
    items, total = course_assignment_repository.list_submissions(
        db,
        assignment_id=assignment_id,
        page=page,
        page_size=page_size,
    )
    diagnostic_items = items
    if total > len(items):
        diagnostic_items, _ = course_assignment_repository.list_submissions(
            db,
            assignment_id=assignment_id,
            page=1,
            page_size=total,
        )
    data = CourseAssignmentSubmissionListResponse(
        items=[_submission_to_read(db, item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        diagnostics=_course_teaching_diagnostics(diagnostic_items, assignment=assignment),
    )
    return success_response(data=data, request=request)


@router.get(
    "/{course_id}/assignments/{assignment_id}/submissions/me",
    response_model=ApiResponse[CourseAssignmentSubmissionRead],
    summary="Get current student's submission for a course assignment",
)
def get_my_course_assignment_submission(
    course_id: int,
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    assignment = _get_assignment_or_404(db, course_id=course_id, assignment_id=assignment_id)
    _assert_can_take_assignment(db, course, current_user)
    submission = course_assignment_repository.get_submission(db, assignment_id=assignment.id, student_id=current_user.id)
    if submission is None:
        raise NotFoundException("尚未开始该作业/测试")
    return success_response(data=_submission_to_read(db, submission), request=request)


@router.post(
    "/{course_id}/assignments/{assignment_id}/close",
    response_model=ApiResponse[CourseAssignmentRead],
    summary="Close a course assignment",
)
def close_course_assignment(
    course_id: int,
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)
    assignment = _get_assignment_or_404(db, course_id=course_id, assignment_id=assignment_id)
    if assignment.status == "archived":
        raise BadRequestException("归档任务不能重复关闭")
    assignment = course_assignment_repository.close_assignment(db, assignment)
    return success_response(data=_assignment_read(db, course, assignment, current_user), request=request)


@router.delete(
    "/{course_id}/knowledge/documents/{document_id}",
    response_model=ApiResponse[CourseKnowledgeDeleteResponse],
    summary="Delete a course knowledge document without deleting its physical file",
)
def delete_course_knowledge_document(
    course_id: int,
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    course = course_service.get_course_or_404(db, course_id)
    _assert_can_manage_course(course, current_user)
    document = _get_course_document_or_404(db, course_id=course_id, document_id=document_id)

    try:
        delete_chroma_by_document_id(owner_id=document.owner_id, document_id=document.id)
    except ChromaStoreError as exc:
        raise AppException(
            "Failed to delete Chroma chunks",
            code=50021,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    deleted_chunks = knowledge_repository.delete_chunks_by_document(db, document_id)
    knowledge_repository.delete_document(db, document)
    return success_response(
        data=CourseKnowledgeDeleteResponse(document_id=document_id, deleted=True, deleted_chunks=deleted_chunks),
        request=request,
    )
