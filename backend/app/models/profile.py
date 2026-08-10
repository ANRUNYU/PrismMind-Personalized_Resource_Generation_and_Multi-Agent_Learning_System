from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, IdMixin, TimestampMixin, dict_default

if TYPE_CHECKING:
    from app.models.learning_path import LearningPath
    from app.models.resource import LearningResource
    from app.models.user import User


class StudentProfile(IdMixin, TimestampMixin, Base):
    __tablename__ = "student_profiles"
    __table_args__ = (
        Index("ix_student_profiles_user_updated_at", "user_id", "updated_at"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    major: Mapped[str | None] = mapped_column(String(120), nullable=True)
    grade: Mapped[str | None] = mapped_column(String(60), nullable=True)
    learning_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    knowledge_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    practice_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    innovation_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    exam_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    efficiency_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    quality_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    profile_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_data: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    build_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    user: Mapped[User] = relationship(back_populates="profile")
    resources: Mapped[list[LearningResource]] = relationship(back_populates="profile")
    learning_paths: Mapped[list[LearningPath]] = relationship(back_populates="profile")


class ProfileConversation(IdMixin, TimestampMixin, Base):
    __tablename__ = "profile_conversations"
    __table_args__ = (Index("ix_profile_conversations_user_status", "user_id", "status"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(32), nullable=False, default="onboarding", server_default="onboarding")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", server_default="active")
    current_step: Mapped[str] = mapped_column(String(32), nullable=False, default="identity", server_default="identity")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)


class ProfileMessage(IdMixin, TimestampMixin, Base):
    __tablename__ = "profile_messages"
    __table_args__ = (
        Index("ix_profile_messages_conversation_created", "conversation_id", "created_at"),
        UniqueConstraint("conversation_id", "idempotency_key", name="uq_profile_message_conversation_key"),
    )

    conversation_id: Mapped[int] = mapped_column(ForeignKey("profile_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    step: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_fields: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    dimension_updates: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    profile_before: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    profile_after: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)


class ProfileEvidenceEvent(IdMixin, TimestampMixin, Base):
    __tablename__ = "profile_evidence_events"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_profile_event_user_idempotency"),
        Index("ix_profile_events_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    profile_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    source_type: Mapped[str] = mapped_column(String(48), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    before: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    after: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
