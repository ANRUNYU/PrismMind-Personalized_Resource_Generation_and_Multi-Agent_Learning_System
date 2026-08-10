from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_student
from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.models.enums import LearningPathStatus, UserRole
from app.models.learning_path import LearningPath, LearningPathStep as LearningPathStepModel
from app.models.user import User
from app.repositories.learning_path_repository import learning_path_repository
from app.repositories.profile_repository import profile_repository
from app.repositories.resource_repository import resource_repository
from app.schemas.common import ApiResponse
from app.schemas.learning_path import (
    LearningPathAdvanceRequest,
    LearningPathAdvanceResponse,
    LearningPathCreateRequest,
    LearningPathListResponse,
    LearningPathQuizRequest,
    LearningPathQuizResponse,
    LearningPathRead,
    LearningPathRecommendationResponse,
    LearningPathStep,
    LearningPathStepStudyCompleteRequest,
    PathDifficulty,
)
from app.services.agents.path_agent import path_planning_agent
from app.services.generation.question_generation_service import question_generation_service
from app.services.generation.reference_context_service import ReferenceContext, reference_context_service
from app.utils.response import success_response

router = APIRouter()


def _path_topic(path: LearningPath) -> str | None:
    for step in path.path_steps or []:
        topic = step.get("topic")
        if topic:
            return str(topic)
    return None


def _path_read(path: LearningPath, warnings: list[str] | None = None) -> LearningPathRead:
    normalized = []
    for step in path.steps or []:
        hidden = step.status == "locked"
        normalized.append({
            "id": step.id, "step_index": step.position, "title": step.title,
            "objective": "完成前序步骤后解锁" if hidden else (step.learning_objectives or [step.description])[0],
            "knowledge_points": [step.knowledge_point], "knowledge_point": step.knowledge_point,
            "suggested_resource_ids": [], "learning_activity": "" if hidden else step.description,
            "description": "" if hidden else step.description, "learning_objectives": [] if hidden else step.learning_objectives or [],
            "practice_task": "完成学习后参加步骤测验", "estimated_minutes": step.estimated_minutes,
            "completion_criteria": f"测验达到 {step.pass_score:g} 分", "status": step.status,
            "study_completed_at": step.study_completed_at, "step_test_id": step.step_test_id,
            "pass_score": step.pass_score, "attempt_count": step.attempt_count,
            "unlocked_at": step.unlocked_at, "completed_at": step.completed_at,
        })
    return LearningPathRead(
        id=path.id,
        title=path.title,
        topic=_path_topic(path),
        current_step=path.current_step,
        completion_rate=path.completion_rate,
        status=path.status,
        path_steps=normalized or path.path_steps or [],
        milestones=path.milestones or [],
        warnings=warnings or [],
        created_at=path.created_at,
        updated_at=path.updated_at,
    )


def _get_accessible_path(db: Session, *, path_id: int, current_user: User) -> LearningPath:
    path = learning_path_repository.get_by_id(db, path_id)
    if path is None:
        raise NotFoundException("Learning path not found")
    if current_user.role != UserRole.admin and path.user_id != current_user.id:
        raise ForbiddenException("No permission to access this learning path")
    return path


@router.post(
    "",
    response_model=ApiResponse[LearningPathRead],
    summary="Create a personalized learning path",
)
def create_learning_path(
    payload: LearningPathCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    warnings: list[str] = []
    profile = profile_repository.get_by_user_id(db, current_user.id) if payload.use_profile else None
    if payload.use_profile and profile is None:
        warnings.append("尚未创建学习画像，学习路径未充分个性化。")

    resources = []
    if payload.use_existing_resources:
        if payload.resource_ids:
            resources, missing_ids, forbidden_ids = resource_repository.get_accessible_resources_by_ids(
                db,
                resource_ids=payload.resource_ids,
                current_user=current_user,
            )
            if missing_ids:
                raise NotFoundException(f"Learning resource not found: {missing_ids[0]}")
            if forbidden_ids:
                raise ForbiddenException(f"No permission to use learning resource {forbidden_ids[0]}")
        else:
            resources = resource_repository.list_recent_resources(db, user_id=current_user.id, limit=10)

    reference_context = reference_context_service.build(
        db,
        current_user=current_user,
        knowledge_document_ids=payload.knowledge_document_ids,
        use_knowledge_base=payload.use_knowledge_base,
        top_k=payload.top_k,
        course_id=payload.course_id,
        query=f"{payload.topic} {payload.target_goal}",
    )
    warnings.extend(reference_context.warnings)

    title = payload.title or f"{payload.topic}学习路径"
    generated = path_planning_agent.generate_learning_path(
        title=title,
        topic=payload.topic,
        course_id=payload.course_id,
        target_goal=payload.target_goal,
        knowledge_points=payload.knowledge_points,
        duration_days=payload.duration_days,
        daily_minutes=payload.daily_minutes,
        difficulty=payload.difficulty,
        profile=profile,
        resources=resources,
        knowledge_context=reference_context.text,
        additional_requirements=payload.additional_requirements,
    )
    if generated.get("generation_mode") == "deterministic_fallback":
        warnings.append("AI 路径模型暂时不可用，已使用本地规则生成可执行学习路径。")
    profile_snapshot = {
        "learning_goal": profile.learning_goal,
        "dimension_scores": {key: float(getattr(profile, key)) for key in ("knowledge_score", "practice_score", "innovation_score", "exam_score", "efficiency_score", "quality_score")},
        "weaknesses": (profile.profile_data or {}).get("weaknesses", []),
    } if profile else {}
    profile_snapshot["source_document_ids"] = reference_context.evidence_snapshot.get("source_document_ids", [])
    path = learning_path_repository.create_path(
        db,
        user_id=current_user.id,
        profile_id=profile.id if profile else None,
        title=generated["title"],
        path_steps=generated["path_steps"],
        milestones=generated["milestones"],
        profile_snapshot=profile_snapshot or None,
    )
    return success_response(data=_path_read(path, warnings=warnings), request=request)


@router.get(
    "",
    response_model=ApiResponse[LearningPathListResponse],
    summary="List learning paths",
)
def list_learning_paths(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: LearningPathStatus | None = Query(default=None),
    topic: str | None = Query(default=None),
    user_id: int | None = Query(default=None, description="Admin-only user filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    if current_user.role == UserRole.admin:
        items, total = learning_path_repository.list_all(
            db,
            page=page,
            page_size=page_size,
            status=status,
            topic=topic,
            user_id=user_id,
        )
    else:
        items, total = learning_path_repository.list_by_user(
            db,
            user_id=current_user.id,
            page=page,
            page_size=page_size,
            status=status,
            topic=topic,
        )
    data = LearningPathListResponse(
        items=[_path_read(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.get(
    "/recommendations",
    response_model=ApiResponse[LearningPathRecommendationResponse],
    summary="Recommend next learning actions",
)
@router.get(
    "/recommendation",
    response_model=ApiResponse[LearningPathRecommendationResponse],
    summary="Recommend next learning actions",
)
def recommend_learning(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    profile = profile_repository.get_by_user_id(db, current_user.id)
    active_paths = learning_path_repository.get_active_paths(db, user_id=current_user.id)
    completed_resources = resource_repository.list_completed_resources(db, user_id=current_user.id, limit=10)
    recent_resources = resource_repository.list_recent_resources(db, user_id=current_user.id, limit=10)
    recommendations = path_planning_agent.recommend_next_learning(
        profile=profile,
        active_paths=active_paths,
        completed_resources=completed_resources,
        recent_resources=recent_resources,
    )
    return success_response(data=LearningPathRecommendationResponse(recommendations=recommendations), request=request)


@router.get(
    "/{path_id}",
    response_model=ApiResponse[LearningPathRead],
    summary="Get learning path detail",
)
def get_learning_path(
    path_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    path = _get_accessible_path(db, path_id=path_id, current_user=current_user)
    return success_response(data=_path_read(path), request=request)


@router.post(
    "/{path_id}/advance",
    response_model=ApiResponse[LearningPathAdvanceResponse],
    summary="Advance the learning path to the next step",
)
def advance_learning_path(
    path_id: int,
    payload: LearningPathAdvanceRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    path = _get_accessible_path(db, path_id=path_id, current_user=current_user)
    raise BadRequestException("Learning path advancement is controlled by the graded step test; use complete-learning then submit the linked test")
    # Legacy implementation below is intentionally unreachable for API compatibility.
    if path.status == LearningPathStatus.completed:
        raise BadRequestException("Learning path is already completed")
    if payload.completed_step_index != path.current_step:
        raise BadRequestException("completed_step_index must match current_step")
    steps = [dict(step) for step in (path.path_steps or [])]
    if payload.completed_step_index < 0 or payload.completed_step_index >= len(steps):
        raise BadRequestException("completed_step_index is out of range")

    completed_step = steps[payload.completed_step_index]
    completed_step["status"] = "completed"
    completed_step["reflection"] = payload.reflection
    completed_step["time_spent_minutes"] = payload.time_spent_minutes
    steps[payload.completed_step_index] = completed_step

    next_step = min(path.current_step + 1, len(steps))
    if next_step < len(steps):
        steps[next_step]["status"] = "active"
    completion_rate = round((next_step / len(steps)) * 100, 2) if steps else 100.0
    status = LearningPathStatus.completed if next_step >= len(steps) else LearningPathStatus.active

    milestones = []
    for milestone in path.milestones or []:
        item = dict(milestone)
        if item.get("target_step_index", 0) <= payload.completed_step_index:
            item["is_reached"] = True
        milestones.append(item)

    updated = learning_path_repository.update_progress(
        db,
        path=path,
        current_step=next_step,
        completion_rate=completion_rate,
        status=status,
        path_steps=steps,
        milestones=milestones,
    )
    current_detail = None
    if updated.current_step < len(updated.path_steps or []):
        current_detail = LearningPathStep(**updated.path_steps[updated.current_step])
    data = LearningPathAdvanceResponse(
        path_id=updated.id,
        current_step=updated.current_step,
        completion_rate=updated.completion_rate,
        status=updated.status,
        current_step_detail=current_detail,
    )
    return success_response(data=data, request=request)


@router.post(
    "/{path_id}/quiz",
    response_model=ApiResponse[LearningPathQuizResponse],
    summary="Generate a short quiz for one learning path step",
)
def generate_learning_path_quiz(
    path_id: int,
    payload: LearningPathQuizRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    path = _get_accessible_path(db, path_id=path_id, current_user=current_user)
    steps = list(path.steps or [])
    if payload.step_index >= len(steps):
        raise BadRequestException("step_index is out of range")
    step = steps[payload.step_index]
    if step.status != "quiz_required":
        raise BadRequestException("Complete this step's learning before starting its quiz")
    try:
        quiz = path_planning_agent.generate_step_quiz(
            path_steps=path.path_steps or [],
            step_index=payload.step_index,
            question_count=payload.question_count,
            difficulty=payload.difficulty,
        )
    except ValueError as exc:
        raise BadRequestException("step_index is out of range", detail=str(exc)) from exc
    from app.repositories.test_repository import student_test_repository
    test = student_test_repository.get_by_id(db, step.step_test_id) if step.step_test_id else None
    if test is None or (test.submitted_at is not None and float(test.score or 0) < step.pass_score):
        knowledge_points = list(dict.fromkeys(
            [item.knowledge_point for item in steps] if step.position == len(steps) - 1 else [step.knowledge_point]
        ))
        questions, answers = question_generation_service.generate(
            topic=step.title, difficulty=payload.difficulty, question_count=payload.question_count,
            question_types=["single_choice", "true_false", "short_answer"], knowledge_points=knowledge_points,
            bank_questions=[], reference_context=ReferenceContext(
                warnings=["当前路径步骤没有可用知识库证据，已使用 AI 通用知识生成题目"],
                evidence_snapshot={"generation_mode": "general", "evidence_available": False},
            ),
        )
        test = student_test_repository.create_test(
            db, user_id=current_user.id, topic=step.title, difficulty=payload.difficulty,
            questions=questions, answers=answers, learning_path_id=path.id, learning_path_step_id=step.id,
            source_type="learning_path_step", evidence_snapshot={
                "knowledge_points": knowledge_points, "pass_score": step.pass_score,
                "generation_mode": "general", "evidence_available": False,
            },
        )
        step.step_test_id = test.id; db.add(step); db.commit()
    data = LearningPathQuizResponse(
        path_id=path.id,
        step_index=payload.step_index,
        quiz_markdown=quiz["quiz_markdown"],
        questions=quiz["questions"],
        test_id=test.id,
    )
    return success_response(data=data, request=request)


@router.post("/{path_id}/steps/{step_id}/complete-learning", response_model=ApiResponse[LearningPathRead])
def complete_step_learning(path_id: int, step_id: int, payload: LearningPathStepStudyCompleteRequest, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_student)):
    from datetime import UTC, datetime
    path = _get_accessible_path(db, path_id=path_id, current_user=current_user)
    step = learning_path_repository.get_step(db, path_id=path.id, step_id=step_id, for_update=True)
    if step is None: raise NotFoundException("Learning path step not found")
    if step.status not in {"active", "learning", "quiz_required"}: raise BadRequestException("Locked or completed step cannot be marked studied")
    if step.status != "quiz_required":
        step.status = "quiz_required"; step.study_completed_at = datetime.now(UTC); db.add(step); db.commit(); db.refresh(path)
    return success_response(data=_path_read(path), request=request)
