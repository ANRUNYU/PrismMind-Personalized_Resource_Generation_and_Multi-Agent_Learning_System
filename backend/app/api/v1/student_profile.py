from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_student
from app.core.exceptions import BadRequestException, NotFoundException
from app.models.profile import StudentProfile
from app.models.user import User
from app.repositories.profile_repository import profile_repository
from app.schemas.common import ApiResponse
from app.schemas.student_profile import (
    ProfileBuildRequest,
    ProfileBuildResponse,
    ProfileConversationRequest,
    ProfileConversationResponse,
    ProfileQuestion,
    ProfileQuestionsResponse,
    RadarChartData,
    StudentProfileCreate,
    StudentProfileRead,
    StudentProfileScoreUpdate,
    StudentProfileUpdate,
    ProfileOnboardingMessageRequest,
    ProfileOnboardingState,
    ProfileMessageRead,
    ProfileEventRequest,
    ProfileEventRead,
)
from app.services.agents.profile_agent import PROFILE_QUESTIONS, SCORE_KEYS, profile_agent
from app.services.profile_update_service import profile_update_service
from app.utils.response import success_response

router = APIRouter()


def _onboarding_response(db: Session, profile, conversation, *, changed_fields=None, changed_dimensions=None, duplicate=False):
    messages = profile_repository.list_messages(db, conversation.id)
    return ProfileOnboardingState(
        conversation_id=conversation.id, mode=conversation.mode, status=conversation.status,
        current_step=conversation.current_step,
        current_question=profile_update_service.question_for(profile, conversation.current_step),
        messages=[ProfileMessageRead.model_validate(item) for item in messages], current_profile=_profile_to_read(profile),
        changed_fields=changed_fields or [], changed_dimensions=changed_dimensions or [], duplicate=duplicate,
    )


def _scores(profile: StudentProfile) -> dict[str, float]:
    return {
        "knowledge_score": float(profile.knowledge_score),
        "practice_score": float(profile.practice_score),
        "innovation_score": float(profile.innovation_score),
        "exam_score": float(profile.exam_score),
        "efficiency_score": float(profile.efficiency_score),
        "quality_score": float(profile.quality_score),
    }


def _profile_to_read(profile: StudentProfile) -> StudentProfileRead:
    profile_data = dict(profile.profile_data or {})
    radar = profile_agent.radar_chart_data(_scores(profile))
    return StudentProfileRead(
        id=profile.id,
        user_id=profile.user_id,
        major=profile.major,
        grade=profile.grade,
        learning_goal=profile.learning_goal,
        current_level=profile_data.get("current_level"),
        preferred_style=profile_data.get("preferred_style"),
        available_time_per_week=profile_data.get("available_time_per_week"),
        exam_pressure=profile_data.get("exam_pressure"),
        practice_experience=profile_data.get("practice_experience"),
        weaknesses=profile_data.get("weaknesses") or [],
        interests=profile_data.get("interests") or [],
        knowledge_score=profile.knowledge_score,
        practice_score=profile.practice_score,
        innovation_score=profile.innovation_score,
        exam_score=profile.exam_score,
        efficiency_score=profile.efficiency_score,
        quality_score=profile.quality_score,
        radar_chart_data=RadarChartData(**radar),
        profile_summary=profile.profile_summary,
        profile_data=profile_data,
        build_step=profile.build_step,
        is_complete=profile.is_complete,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def _payload_to_profile_data(payload: StudentProfileCreate | StudentProfileUpdate) -> dict[str, Any]:
    return payload.model_dump(exclude_unset=True, mode="json")


def _merge_profile_data(profile: StudentProfile | None, incoming: dict[str, Any]) -> dict[str, Any]:
    current = dict(profile.profile_data or {}) if profile else {}
    for key, value in incoming.items():
        if value is not None:
            current[key] = value
    return current


def _persist_profile(
    db: Session,
    *,
    user_id: int,
    profile: StudentProfile | None,
    profile_data: dict[str, Any],
    build_step: int | None = None,
) -> StudentProfile:
    scores = profile_agent.calculate_scores(profile_data)
    summary = profile_agent.generate_profile_summary(profile_data, scores)
    is_complete = profile_agent.completeness(profile_data)
    if profile is None:
        return profile_repository.create_profile(
            db,
            user_id=user_id,
            major=profile_data.get("major"),
            grade=profile_data.get("grade"),
            learning_goal=profile_data.get("learning_goal"),
            scores=scores,
            profile_summary=summary,
            profile_data=profile_data,
            build_step=build_step if build_step is not None else (len(PROFILE_QUESTIONS) if is_complete else 0),
            is_complete=is_complete,
        )
    return profile_repository.update_profile(
        db,
        profile=profile,
        major=profile_data.get("major"),
        grade=profile_data.get("grade"),
        learning_goal=profile_data.get("learning_goal"),
        scores=scores,
        profile_summary=summary,
        profile_data=profile_data,
        build_step=build_step if build_step is not None else profile.build_step,
        is_complete=is_complete,
    )


@router.get("/onboarding", response_model=ApiResponse[ProfileOnboardingState])
def get_profile_onboarding(request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_student)):
    profile, conversation = profile_update_service.onboarding_state(db, user_id=current_user.id)
    return success_response(data=_onboarding_response(db, profile, conversation), request=request)


@router.post("/onboarding/messages", response_model=ApiResponse[ProfileOnboardingState])
def answer_profile_onboarding(payload: ProfileOnboardingMessageRequest, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_student)):
    try:
        result = profile_update_service.answer(db, user_id=current_user.id, conversation_id=payload.conversation_id, answer=payload.answer, idempotency_key=payload.idempotency_key)
    except ValueError as exc:
        raise BadRequestException(str(exc)) from exc
    return success_response(data=_onboarding_response(db, result["profile"], result["conversation"], changed_fields=result["changed_fields"], changed_dimensions=result["changed_dimensions"], duplicate=result["duplicate"]), request=request)


@router.post("/onboarding/messages/stream", summary="Stream continuous profile analysis")
def stream_profile_analysis(
    payload: ProfileOnboardingMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    profile, conversation = profile_update_service.onboarding_state(db, user_id=current_user.id)
    if conversation.id != payload.conversation_id:
        raise BadRequestException("画像会话已更新，请刷新页面后重试")
    if conversation.current_step != "continuous" or not profile.is_complete:
        raise BadRequestException("画像引导尚未完成，请先完成当前画像问题")
    before = profile_update_service.snapshot(profile)
    history = [
        {"role": item.role, "content": item.content}
        for item in profile_repository.list_messages(db, conversation.id)[-12:]
    ]

    async def events():
        content = ""
        yield json.dumps({"type": "meta", "conversation_id": conversation.id}, ensure_ascii=False) + "\n"
        yield json.dumps({"type": "stage", "stage": "analyzing_profile", "message": "正在结合你的画像分析"}, ensure_ascii=False) + "\n"
        try:
            async for delta in profile_agent.stream_profile_answer(
                question=payload.answer,
                profile_snapshot={**before, "profile_summary": profile.profile_summary},
                conversation_history=history,
            ):
                content += delta
                yield json.dumps({"type": "delta", "text": delta}, ensure_ascii=False) + "\n"
            if not content.strip():
                raise RuntimeError("画像分析模型未返回有效内容")
            profile_update_service.answer(
                db, user_id=current_user.id, conversation_id=conversation.id, answer=payload.answer,
                idempotency_key=payload.idempotency_key, continuous_reply_override=content,
            )
            yield json.dumps({"type": "done", "conversation_id": conversation.id}, ensure_ascii=False) + "\n"
        except Exception as exc:
            yield json.dumps({"type": "error", "error": str(exc)}, ensure_ascii=False) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson")


@router.get("/conversations/{conversation_id}", response_model=ApiResponse[ProfileOnboardingState])
def get_profile_conversation(conversation_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_student)):
    conversation = profile_repository.get_conversation(db, conversation_id, current_user.id)
    if conversation is None:
        raise NotFoundException("Profile conversation not found")
    profile = profile_repository.get_by_user_id(db, current_user.id)
    return success_response(data=_onboarding_response(db, profile, conversation), request=request)


@router.get("/events", response_model=ApiResponse[list[ProfileEventRead]])
def list_profile_events(request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_student)):
    return success_response(data=[ProfileEventRead.model_validate(item) for item in profile_repository.list_events(db, current_user.id)], request=request)


@router.post("/events", response_model=ApiResponse[ProfileEventRead])
def apply_profile_event(payload: ProfileEventRequest, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_student)):
    try:
        event = profile_update_service.apply_event(db, user_id=current_user.id, **payload.model_dump())
    except ValueError as exc:
        raise BadRequestException(str(exc)) from exc
    return success_response(data=ProfileEventRead.model_validate(event), request=request)


@router.post(
    "",
    response_model=ApiResponse[StudentProfileRead],
    summary="Create or initialize the current student's profile",
)
def create_student_profile(
    payload: StudentProfileCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    existing = profile_repository.get_by_user_id(db, current_user.id)
    incoming = _payload_to_profile_data(payload)
    profile_data = _merge_profile_data(existing, incoming)
    profile = _persist_profile(db, user_id=current_user.id, profile=existing, profile_data=profile_data)
    return success_response(data=_profile_to_read(profile), request=request)


@router.get(
    "/me",
    response_model=ApiResponse[StudentProfileRead],
    summary="Get the current student's profile",
)
def get_my_profile(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    profile = profile_repository.get_by_user_id(db, current_user.id)
    if profile is None:
        raise NotFoundException("Student profile has not been created")
    return success_response(data=_profile_to_read(profile), request=request)


@router.patch(
    "/me",
    response_model=ApiResponse[StudentProfileRead],
    summary="Update the current student's profile",
)
def update_my_profile(
    payload: StudentProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    profile = profile_repository.get_by_user_id(db, current_user.id)
    if profile is None:
        raise NotFoundException("Student profile has not been created")
    incoming = _payload_to_profile_data(payload)
    profile_data = _merge_profile_data(profile, incoming)
    updated = _persist_profile(db, user_id=current_user.id, profile=profile, profile_data=profile_data)
    return success_response(data=_profile_to_read(updated), request=request)


@router.post(
    "/conversations",
    response_model=ApiResponse[ProfileConversationResponse],
    summary="Analyze one conversational profile message",
)
def analyze_profile_conversation(
    payload: ProfileConversationRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    analysis = profile_agent.analyze_profile_input(
        message=payload.message,
        conversation_history=[item.model_dump(mode="json") for item in payload.conversation_history],
    )
    current_profile = None
    applied = False
    if payload.apply:
        profile = profile_repository.get_or_create_profile(db, current_user.id)
        profile_data = _merge_profile_data(profile, analysis["extracted_profile"])
        profile = _persist_profile(db, user_id=current_user.id, profile=profile, profile_data=profile_data)
        current_profile = _profile_to_read(profile)
        applied = True

    data = ProfileConversationResponse(
        analysis=analysis["analysis"],
        extracted_profile=analysis["extracted_profile"],
        suggested_scores=analysis["suggested_scores"],
        next_question=analysis["next_question"],
        applied=applied,
        current_profile=current_profile,
    )
    return success_response(data=data, request=request)


@router.get(
    "/questions",
    response_model=ApiResponse[ProfileQuestionsResponse],
    summary="Get guided profile-building questions",
)
def get_profile_questions(request: Request, current_user: User = Depends(require_student)):
    _ = current_user
    questions = [ProfileQuestion(**item) for item in PROFILE_QUESTIONS]
    return success_response(data=ProfileQuestionsResponse(questions=questions), request=request)


@router.post(
    "/build",
    response_model=ApiResponse[ProfileBuildResponse],
    summary="Build the current student's profile step by step",
)
def build_profile_step(
    payload: ProfileBuildRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    profile = profile_repository.get_or_create_profile(db, current_user.id)
    try:
        result = profile_agent.build_profile_step(
            current_data=dict(profile.profile_data or {}),
            step=payload.step,
            answer=payload.answer,
        )
    except ValueError as exc:
        raise BadRequestException("Invalid profile build step", detail=str(exc)) from exc

    if result["is_complete"]:
        updated = profile_repository.update_build_step(
            db,
            profile=profile,
            build_step=len(PROFILE_QUESTIONS),
            profile_data=result["profile_data"],
            is_complete=True,
            scores=result["scores"],
            profile_summary=result["profile_summary"],
        )
    else:
        updated = profile_repository.update_build_step(
            db,
            profile=profile,
            build_step=payload.step,
            profile_data=result["profile_data"],
            is_complete=False,
        )

    data = ProfileBuildResponse(
        step=result["next_step"],
        current_profile=_profile_to_read(updated),
        next_question=result["next_question"],
        is_complete=updated.is_complete,
    )
    return success_response(data=data, request=request)


@router.patch(
    "/scores",
    response_model=ApiResponse[StudentProfileRead],
    summary="Update the current student's six-dimensional profile scores",
)
def update_profile_scores(
    payload: StudentProfileScoreUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    profile = profile_repository.get_by_user_id(db, current_user.id)
    if profile is None:
        raise NotFoundException("Student profile has not been created")
    scores = {key: payload.model_dump()[key] for key in SCORE_KEYS}
    updated = profile_repository.update_scores(db, profile=profile, scores=scores)
    updated.profile_summary = profile_agent.generate_profile_summary(dict(updated.profile_data or {}), _scores(updated))
    db.add(updated)
    db.commit()
    db.refresh(updated)
    return success_response(data=_profile_to_read(updated), request=request)
