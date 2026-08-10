from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_student
from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.models.assessment import LearningAssessment
from app.models.enums import UserRole
from app.models.learning_path import LearningPath
from app.models.resource import LearningResource
from app.models.test import StudentTest
from app.models.user import User
from app.repositories.assessment_repository import assessment_repository
from app.repositories.learning_path_repository import learning_path_repository
from app.repositories.profile_repository import profile_repository
from app.repositories.resource_repository import resource_repository
from app.repositories.test_repository import student_test_repository
from app.schemas.assessment import (
    AssessmentType,
    LearningAssessmentCreate,
    LearningAssessmentListResponse,
    LearningAssessmentRead,
    LearningAssessmentSubmit,
    LearningAssessmentSummary,
    LearningRecommendationResponse,
)
from app.schemas.common import ApiResponse
from app.schemas.quality_analysis import QualityAnalysis
from app.services.agents.assessment_agent import assessment_agent
from app.services.quality_analysis_service import quality_analysis_service
from app.utils.response import success_response

router = APIRouter()


def _assessment_level(score: float | None) -> str:
    if score is None:
        return "待评估"
    if score >= 90:
        return "优秀"
    if score >= 80:
        return "良好"
    if score >= 70:
        return "中等"
    if score >= 60:
        return "及格"
    return "需加强"


def _target_info(assessment: LearningAssessment) -> tuple[str | None, int | None]:
    if assessment.test_id is not None:
        return "test", assessment.test_id
    if assessment.resource_id is not None:
        return "resource", assessment.resource_id
    if assessment.path_id is not None:
        return "path", assessment.path_id
    if assessment.topic:
        return "topic", None
    return assessment.assessment_type, None


def _assessment_quality(assessment: LearningAssessment) -> QualityAnalysis | None:
    """Expose the linked test's generation report without inventing assessment metrics."""
    test = assessment.test
    if test is None:
        return None
    if test.quality_analysis:
        return QualityAnalysis.model_validate(test.quality_analysis)
    return quality_analysis_service.analyze_generated_content(
        content={"questions": test.questions or [], "answers": test.answers or {}},
        references=[],
        warnings=["历史测验未保存生成时的知识库证据"],
    )


def _assessment_read(assessment: LearningAssessment) -> LearningAssessmentRead:
    target_type, target_id = _target_info(assessment)
    summary = assessment.analysis
    title = assessment.topic or {
        "resource": "学习资源评估",
        "path": "学习路径评估",
        "topic": "主题学习评估",
        "test": "测试评估",
        "comprehensive": "综合学习评估",
    }.get(assessment.assessment_type, "学习评估")
    return LearningAssessmentRead.model_validate(assessment).model_copy(
        update={
            "assessment_id": assessment.id,
            "title": title,
            "target_type": target_type,
            "target_id": target_id,
            "level": _assessment_level(assessment.score),
            "summary": summary,
            "strengths": assessment.correct_topics or [],
            "weaknesses": assessment.incorrect_topics or [],
            "weak_topics": assessment.incorrect_topics or [],
            "quality_analysis": _assessment_quality(assessment),
        }
    )


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


def _load_test(db: Session, test_id: int | None, current_user: User) -> StudentTest | None:
    if test_id is None:
        return None
    test = student_test_repository.get_by_id(db, test_id)
    if test is None:
        raise NotFoundException("Student test not found")
    _assert_owner_or_admin(owner_id=test.user_id, current_user=current_user, message="No permission to access this student test")
    return test


def _target_user_id(current_user: User, resource: LearningResource | None, path: LearningPath | None, test: StudentTest | None) -> int:
    linked_user_ids = {item.user_id for item in [resource, path, test] if item is not None}
    if len(linked_user_ids) > 1:
        raise BadRequestException("Linked resource, path, and test must belong to the same user")
    if linked_user_ids:
        return linked_user_ids.pop()
    return current_user.id


def _score_from_evidence(evidence: dict | None) -> float | None:
    if not evidence:
        return None
    for section in ("test_result", "path_progress"):
        value = evidence.get(section)
        if isinstance(value, dict):
            raw_score = value.get("score") or value.get("completion_rate")
            if raw_score is not None:
                try:
                    return max(0.0, min(100.0, float(raw_score)))
                except (TypeError, ValueError):
                    return None
    return None


def _as_text_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.replace("，", ",").replace("、", ",").split(",") if item.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [str(value).strip()] if str(value).strip() else []


def _topics_from_submission(payload: LearningAssessmentSubmit, *keys: str) -> list[str]:
    topics: list[str] = []
    for key in keys:
        topics.extend(_as_text_list(payload.answers.get(key)))
    return list(dict.fromkeys(topics))


def _score_from_submission(payload: LearningAssessmentSubmit, current_score: float | None) -> float | None:
    if payload.self_rating is not None:
        return payload.self_rating
    for key in ("score", "self_score", "rating"):
        value = payload.answers.get(key)
        if value is None:
            continue
        try:
            return max(0.0, min(100.0, float(value)))
        except (TypeError, ValueError):
            continue
    return current_score


def _get_accessible_assessment(db: Session, *, assessment_id: int, current_user: User) -> LearningAssessment:
    assessment = assessment_repository.get_by_id(db, assessment_id)
    if assessment is None:
        raise NotFoundException("Learning assessment not found")
    _assert_owner_or_admin(
        owner_id=assessment.user_id,
        current_user=current_user,
        message="No permission to access this learning assessment",
    )
    return assessment


@router.post(
    "",
    response_model=ApiResponse[LearningAssessmentRead],
    summary="Create a learning assessment",
)
def create_assessment(
    payload: LearningAssessmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    resource = _load_resource(db, payload.resource_id, current_user)
    path = _load_path(db, payload.path_id, current_user)
    test = _load_test(db, payload.test_id, current_user)
    target_user_id = _target_user_id(current_user, resource, path, test)
    profile = profile_repository.get_by_user_id(db, target_user_id)
    recent_resources = resource_repository.list_recent_resources(db, user_id=target_user_id, limit=30)
    recent_paths, _ = learning_path_repository.list_all(db, user_id=target_user_id, page=1, page_size=30)
    recent_tests = student_test_repository.list_recent_by_user(db, user_id=target_user_id, limit=30)
    recent_assessments = assessment_repository.list_recent_by_user(db, user_id=target_user_id, limit=30)

    evidence_score = _score_from_evidence(payload.learning_evidence)
    has_objective_evidence = any((resource, path, test, payload.score is not None, evidence_score is not None))
    score = assessment_agent.estimate_score(
        assessment_type=payload.assessment_type,
        explicit_score=payload.score if payload.score is not None else evidence_score,
        resource=resource, path=path, test=test, profile=profile,
        resources=recent_resources, paths=recent_paths, tests=recent_tests, assessments=recent_assessments,
    ) if has_objective_evidence or payload.assessment_type == "comprehensive" else None
    analysis = assessment_agent.build_analysis(
        assessment_type=payload.assessment_type,
        topic=payload.topic or (test.topic if test else None) or (resource.topic if resource else None),
        score=score,
        correct_topics=payload.correct_topics,
        incorrect_topics=payload.incorrect_topics,
    ) if score is not None else "尚无真实作答或学习完成证据，暂不计算分数。"
    if payload.learning_evidence:
        analysis = f"{analysis} Evidence fields considered: {', '.join(payload.learning_evidence.keys())}."
    recommendations = assessment_agent.build_recommendations(
        score=score, incorrect_topics=payload.incorrect_topics, profile=profile,
    ) if score is not None else []
    assessment = assessment_repository.create_assessment(
        db,
        user_id=target_user_id,
        assessment_type=payload.assessment_type,
        topic=payload.topic or (test.topic if test else None) or (resource.topic if resource else None),
        resource_id=resource.id if resource else None,
        path_id=path.id if path else None,
        test_id=test.id if test else None,
        score=score,
        correct_topics=payload.correct_topics,
        incorrect_topics=payload.incorrect_topics,
        analysis=analysis,
        recommendations=recommendations,
    )
    return success_response(data=_assessment_read(assessment), request=request)


@router.get(
    "",
    response_model=ApiResponse[LearningAssessmentListResponse],
    summary="List learning assessments",
)
def list_assessments(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    assessment_type: AssessmentType | None = Query(default=None),
    topic: str | None = Query(default=None),
    min_score: float | None = Query(default=None, ge=0, le=100),
    max_score: float | None = Query(default=None, ge=0, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    items, total = assessment_repository.list_by_user(
        db,
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        assessment_type=assessment_type,
        topic=topic,
        min_score=min_score,
        max_score=max_score,
    )
    data = LearningAssessmentListResponse(
        items=[_assessment_read(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.get(
    "/summary",
    response_model=ApiResponse[LearningAssessmentSummary],
    summary="Summarize learning assessment history",
)
def get_assessment_summary(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    assessments = assessment_repository.list_all_by_user(db, user_id=current_user.id)
    profile = profile_repository.get_by_user_id(db, current_user.id)
    return success_response(
        data=LearningAssessmentSummary(**assessment_agent.summarize(assessments=assessments, profile=profile)),
        request=request,
    )


@router.get(
    "/recommendations",
    response_model=ApiResponse[LearningRecommendationResponse],
    summary="Recommend learning actions from assessment history",
)
def get_assessment_recommendations(
    request: Request,
    topic: str | None = Query(default=None),
    top_k: int = Query(default=5, ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    assessments = assessment_repository.list_recent_by_user(db, user_id=current_user.id, limit=50)
    if topic:
        keyword = topic.lower()
        assessments = [item for item in assessments if keyword in (item.topic or "").lower()]
    profile = profile_repository.get_by_user_id(db, current_user.id)
    return success_response(
        data=LearningRecommendationResponse(**assessment_agent.recommend(assessments=assessments, profile=profile, top_k=top_k)),
        request=request,
    )


@router.get(
    "/{assessment_id}",
    response_model=ApiResponse[LearningAssessmentRead],
    summary="Get learning assessment detail",
)
def get_assessment_detail(
    assessment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    assessment = _get_accessible_assessment(db, assessment_id=assessment_id, current_user=current_user)
    return success_response(data=_assessment_read(assessment), request=request)


@router.post(
    "/{assessment_id}/submit",
    response_model=ApiResponse[LearningAssessmentRead],
    summary="Submit assessment answers and feedback",
)
def submit_assessment(
    assessment_id: int,
    payload: LearningAssessmentSubmit,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    assessment = _get_accessible_assessment(db, assessment_id=assessment_id, current_user=current_user)
    profile = profile_repository.get_by_user_id(db, assessment.user_id)
    score = assessment_agent.estimate_score(
        assessment_type=assessment.assessment_type,
        explicit_score=_score_from_submission(payload, assessment.score),
        profile=profile,
        assessments=assessment_repository.list_recent_by_user(db, user_id=assessment.user_id, limit=30),
    )
    submitted_strengths = _topics_from_submission(payload, "strengths", "correct_topics", "mastered_topics")
    submitted_weaknesses = _topics_from_submission(payload, "weaknesses", "weak_topics", "incorrect_topics")
    correct_topics = list(dict.fromkeys([*map(str, assessment.correct_topics or []), *submitted_strengths]))
    incorrect_topics = list(dict.fromkeys([*map(str, assessment.incorrect_topics or []), *submitted_weaknesses]))
    analysis = assessment_agent.build_analysis(
        assessment_type=assessment.assessment_type,
        topic=assessment.topic,
        score=score,
        correct_topics=correct_topics,
        incorrect_topics=incorrect_topics,
    )
    if payload.reflection:
        analysis = f"{analysis} 学生反思：{payload.reflection.strip()}"
    if payload.feedback:
        analysis = f"{analysis} 学生反馈：{payload.feedback.strip()}"
    recommendations = assessment_agent.build_recommendations(
        score=score,
        incorrect_topics=incorrect_topics,
        profile=profile,
    )
    updated = assessment_repository.submit_assessment(
        db,
        assessment=assessment,
        answers=payload.answers,
        reflection=payload.reflection,
        self_rating=payload.self_rating,
        feedback=payload.feedback,
        score=score,
        correct_topics=correct_topics,
        incorrect_topics=incorrect_topics,
        analysis=analysis,
        recommendations=recommendations,
    )
    return success_response(data=_assessment_read(updated), request=request)
