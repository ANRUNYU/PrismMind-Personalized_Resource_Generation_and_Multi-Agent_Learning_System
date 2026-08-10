from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_student
from app.models.enums import LearningPathStatus, TaskStatus
from app.models.user import User
from app.repositories.assessment_repository import assessment_repository
from app.repositories.course_repository import course_repository
from app.repositories.learning_path_repository import learning_path_repository
from app.repositories.profile_repository import profile_repository
from app.repositories.resource_repository import resource_repository
from app.repositories.task_repository import task_repository
from app.repositories.tutoring_repository import tutoring_repository
from app.schemas.common import ApiResponse
from app.schemas.student_dashboard import (
    DashboardAssessmentsSummary,
    DashboardCollectionSummary,
    DashboardCoursesSummary,
    DashboardLLMSummary,
    DashboardLearningPathsSummary,
    DashboardProfileSummary,
    DashboardResourcesSummary,
    DashboardTasksSummary,
    DashboardTutoringSummary,
    StudentDashboardSummary,
)
from app.services.agents.assessment_agent import assessment_agent
from app.services.llm.provider import llm_provider
from app.utils.response import success_response

router = APIRouter()


@router.get(
    "/summary",
    response_model=ApiResponse[StudentDashboardSummary],
    summary="Get aggregated student dashboard summary",
)
def get_student_dashboard_summary(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    user_id = current_user.id
    profile = profile_repository.get_by_user_id(db, user_id)
    course_items, course_total = course_repository.list_visible_courses(db, current_user, page=1, page_size=100)
    resource_items, resource_total = resource_repository.list_by_user(db, user_id=user_id, page=1, page_size=5)
    _, completed_resource_total = resource_repository.list_by_user(
        db,
        user_id=user_id,
        page=1,
        page_size=1,
        is_completed=True,
    )
    path_items, path_total = learning_path_repository.list_all(db, user_id=user_id, page=1, page_size=100)
    _, active_path_total = learning_path_repository.list_all(
        db,
        user_id=user_id,
        page=1,
        page_size=1,
        status=LearningPathStatus.active,
    )
    assessments = assessment_repository.list_all_by_user(db, user_id=user_id)
    assessment_summary = assessment_agent.summarize(assessments=assessments, profile=profile)
    tutoring_items, tutoring_total = tutoring_repository.list_by_user(db, user_id=user_id, page=1, page_size=5)
    _, pending_tasks = task_repository.list_tasks(db, owner_id=user_id, page=1, page_size=1, status=TaskStatus.pending.value)
    _, running_tasks = task_repository.list_tasks(db, owner_id=user_id, page=1, page_size=1, status=TaskStatus.running.value)
    _, completed_tasks = task_repository.list_tasks(db, owner_id=user_id, page=1, page_size=1, status=TaskStatus.success.value)
    llm_status = llm_provider.get_provider_status()

    data = StudentDashboardSummary(
        profile=DashboardProfileSummary(
            exists=profile is not None,
            summary=profile.profile_summary if profile else None,
            scores=_profile_scores(profile),
        ),
        courses=DashboardCoursesSummary(
            total=course_total,
            active=sum(1 for course in course_items if course.status == "active"),
            recent=[
                {
                    "id": course.id,
                    "name": course.name,
                    "status": course.status,
                    "updated_at": course.updated_at,
                }
                for course in course_items[:5]
            ],
        ),
        resources=DashboardResourcesSummary(
            total=resource_total,
            completed=completed_resource_total,
            recent=[
                {
                    "id": item.id,
                    "title": item.title,
                    "resource_type": item.resource_type,
                    "topic": item.topic,
                    "completed": item.is_completed,
                    "updated_at": item.updated_at,
                }
                for item in resource_items
            ],
        ),
        learning_paths=DashboardLearningPathsSummary(
            total=path_total,
            in_progress=active_path_total,
            average_completion=_average_completion(path_items),
            recent=[
                {
                    "id": item.id,
                    "title": item.title,
                    "status": item.status.value if hasattr(item.status, "value") else str(item.status),
                    "completion_rate": item.completion_rate,
                    "updated_at": item.updated_at,
                }
                for item in path_items[:5]
            ],
        ),
        assessments=DashboardAssessmentsSummary(
            total=assessment_summary["total_assessments"],
            average_score=assessment_summary["average_score"],
            recent_score=assessment_summary["latest_score"],
            weak_topics=assessment_summary["weak_topics"],
            recommendations=assessment_summary["recent_recommendations"],
        ),
        tutoring=DashboardTutoringSummary(
            sessions=tutoring_total,
            recent=[
                {
                    "id": item.id,
                    "topic": item.topic,
                    "session_type": item.session_type,
                    "question": item.user_question,
                    "created_at": item.created_at,
                }
                for item in tutoring_items
            ],
        ),
        tasks=DashboardTasksSummary(
            pending=pending_tasks,
            running=running_tasks,
            completed=completed_tasks,
        ),
        llm=DashboardLLMSummary(
            provider=str(llm_status.get("provider") or ""),
            model=str(llm_status.get("model") or ""),
            real_provider_enabled=bool(llm_status.get("real_provider_enabled")),
        ),
        updated_at=datetime.now(timezone.utc),
    )
    return success_response(data=data, request=request)


def _profile_scores(profile) -> dict[str, float]:
    if profile is None:
        return {}
    return {
        "knowledge_score": float(profile.knowledge_score or 0),
        "practice_score": float(profile.practice_score or 0),
        "innovation_score": float(profile.innovation_score or 0),
        "exam_score": float(profile.exam_score or 0),
        "efficiency_score": float(profile.efficiency_score or 0),
        "quality_score": float(profile.quality_score or 0),
    }


def _average_completion(paths) -> float:
    if not paths:
        return 0.0
    return round(sum(float(item.completion_rate or 0) for item in paths) / len(paths), 2)
