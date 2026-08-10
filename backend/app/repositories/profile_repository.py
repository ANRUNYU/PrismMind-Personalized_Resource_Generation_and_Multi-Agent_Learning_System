from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.profile import ProfileConversation, ProfileEvidenceEvent, ProfileMessage, StudentProfile


class ProfileRepository:
    def get_active_conversation(self, db: Session, user_id: int) -> ProfileConversation | None:
        return db.scalar(select(ProfileConversation).where(ProfileConversation.user_id == user_id, ProfileConversation.status == "active").order_by(ProfileConversation.id.desc()))

    def get_conversation(self, db: Session, conversation_id: int, user_id: int) -> ProfileConversation | None:
        return db.scalar(select(ProfileConversation).where(ProfileConversation.id == conversation_id, ProfileConversation.user_id == user_id))

    def create_conversation(self, db: Session, *, user_id: int, profile_id: int, mode: str, step: str) -> ProfileConversation:
        conversation = ProfileConversation(user_id=user_id, profile_id=profile_id, mode=mode, status="active", current_step=step)
        db.add(conversation); db.commit(); db.refresh(conversation)
        return conversation

    def list_messages(self, db: Session, conversation_id: int) -> list[ProfileMessage]:
        return list(db.scalars(select(ProfileMessage).where(ProfileMessage.conversation_id == conversation_id).order_by(ProfileMessage.created_at, ProfileMessage.id)))

    def get_message_by_key(self, db: Session, conversation_id: int, key: str) -> ProfileMessage | None:
        return db.scalar(select(ProfileMessage).where(ProfileMessage.conversation_id == conversation_id, ProfileMessage.idempotency_key == key))

    def create_message(self, db: Session, **values: Any) -> ProfileMessage:
        message = ProfileMessage(**values); db.add(message); db.commit(); db.refresh(message)
        return message

    def save_conversation(self, db: Session, conversation: ProfileConversation) -> ProfileConversation:
        db.add(conversation); db.commit(); db.refresh(conversation); return conversation

    def get_event_by_key(self, db: Session, user_id: int, key: str) -> ProfileEvidenceEvent | None:
        return db.scalar(select(ProfileEvidenceEvent).where(ProfileEvidenceEvent.user_id == user_id, ProfileEvidenceEvent.idempotency_key == key))

    def create_event(self, db: Session, **values: Any) -> ProfileEvidenceEvent:
        event = ProfileEvidenceEvent(**values); db.add(event); db.commit(); db.refresh(event); return event

    def list_events(self, db: Session, user_id: int, limit: int = 50) -> list[ProfileEvidenceEvent]:
        return list(db.scalars(select(ProfileEvidenceEvent).where(ProfileEvidenceEvent.user_id == user_id).order_by(ProfileEvidenceEvent.created_at.desc()).limit(limit)))
    def get_by_user_id(self, db: Session, user_id: int) -> StudentProfile | None:
        stmt = select(StudentProfile).where(StudentProfile.user_id == user_id)
        return db.scalar(stmt)

    def create_profile(
        self,
        db: Session,
        *,
        user_id: int,
        major: str | None = None,
        grade: str | None = None,
        learning_goal: str | None = None,
        scores: dict[str, float] | None = None,
        profile_summary: str | None = None,
        profile_data: dict[str, Any] | None = None,
        build_step: int = 0,
        is_complete: bool = False,
    ) -> StudentProfile:
        scores = scores or {}
        profile = StudentProfile(
            user_id=user_id,
            major=major,
            grade=grade,
            learning_goal=learning_goal,
            knowledge_score=scores.get("knowledge_score", 0.0),
            practice_score=scores.get("practice_score", 0.0),
            innovation_score=scores.get("innovation_score", 0.0),
            exam_score=scores.get("exam_score", 0.0),
            efficiency_score=scores.get("efficiency_score", 0.0),
            quality_score=scores.get("quality_score", 0.0),
            profile_summary=profile_summary,
            profile_data=profile_data or {},
            build_step=build_step,
            is_complete=is_complete,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile

    def update_profile(
        self,
        db: Session,
        *,
        profile: StudentProfile,
        major: str | None = None,
        grade: str | None = None,
        learning_goal: str | None = None,
        scores: dict[str, float] | None = None,
        profile_summary: str | None = None,
        profile_data: dict[str, Any] | None = None,
        build_step: int | None = None,
        is_complete: bool | None = None,
    ) -> StudentProfile:
        profile.major = major
        profile.grade = grade
        profile.learning_goal = learning_goal
        if scores is not None:
            self._apply_scores(profile, scores)
        if profile_summary is not None:
            profile.profile_summary = profile_summary
        if profile_data is not None:
            profile.profile_data = profile_data
        if build_step is not None:
            profile.build_step = build_step
        if is_complete is not None:
            profile.is_complete = is_complete
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile

    def update_scores(
        self,
        db: Session,
        *,
        profile: StudentProfile,
        scores: dict[str, float],
    ) -> StudentProfile:
        self._apply_scores(profile, scores)
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile

    def update_build_step(
        self,
        db: Session,
        *,
        profile: StudentProfile,
        build_step: int,
        profile_data: dict[str, Any],
        is_complete: bool,
        scores: dict[str, float] | None = None,
        profile_summary: str | None = None,
    ) -> StudentProfile:
        profile.build_step = build_step
        profile.profile_data = profile_data
        profile.major = profile_data.get("major")
        profile.grade = profile_data.get("grade")
        profile.learning_goal = profile_data.get("learning_goal")
        profile.is_complete = is_complete
        if scores is not None:
            self._apply_scores(profile, scores)
        if profile_summary is not None:
            profile.profile_summary = profile_summary
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile

    def get_or_create_profile(self, db: Session, user_id: int) -> StudentProfile:
        profile = self.get_by_user_id(db, user_id)
        if profile is not None:
            return profile
        return self.create_profile(db, user_id=user_id, profile_data={}, build_step=0, is_complete=False)

    def _apply_scores(self, profile: StudentProfile, scores: dict[str, float]) -> None:
        profile.knowledge_score = scores.get("knowledge_score", profile.knowledge_score)
        profile.practice_score = scores.get("practice_score", profile.practice_score)
        profile.innovation_score = scores.get("innovation_score", profile.innovation_score)
        profile.exam_score = scores.get("exam_score", profile.exam_score)
        profile.efficiency_score = scores.get("efficiency_score", profile.efficiency_score)
        profile.quality_score = scores.get("quality_score", profile.quality_score)


profile_repository = ProfileRepository()
