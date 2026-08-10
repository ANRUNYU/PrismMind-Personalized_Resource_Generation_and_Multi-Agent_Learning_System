from __future__ import annotations

from typing import TYPE_CHECKING, Any

from datetime import datetime
from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, JSONList, IdMixin, TimestampMixin, dict_default, list_default
from app.models.enums import LearningPathStatus

if TYPE_CHECKING:
    from app.models.assessment import LearningAssessment
    from app.models.profile import StudentProfile
    from app.models.user import User


class LearningPath(IdMixin, TimestampMixin, Base):
    __tablename__ = "learning_paths"
    __table_args__ = (
        Index("ix_learning_paths_user_status_created_at", "user_id", "status", "created_at"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    profile_id: Mapped[int | None] = mapped_column(ForeignKey("student_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    path_steps: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    completion_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    milestones: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    status: Mapped[LearningPathStatus] = mapped_column(
        Enum(LearningPathStatus, name="learning_path_status"),
        nullable=False,
        default=LearningPathStatus.active,
        server_default=LearningPathStatus.active.value,
        index=True,
    )
    profile_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONDict, nullable=True)

    user: Mapped[User] = relationship()
    profile: Mapped[StudentProfile | None] = relationship(back_populates="learning_paths")
    assessments: Mapped[list[LearningAssessment]] = relationship(back_populates="learning_path")
    steps: Mapped[list[LearningPathStep]] = relationship(
        back_populates="learning_path", cascade="all, delete-orphan", order_by="LearningPathStep.position"
    )


class LearningPathStep(IdMixin, TimestampMixin, Base):
    __tablename__ = "learning_path_steps"
    __table_args__ = (
        UniqueConstraint("learning_path_id", "position", name="uq_learning_path_step_position"),
        Index("ix_learning_path_steps_path_status", "learning_path_id", "status"),
    )

    learning_path_id: Mapped[int] = mapped_column(ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    knowledge_point: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    learning_objectives: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    estimated_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="locked", server_default="locked")
    study_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    step_test_id: Mapped[int | None] = mapped_column(
        ForeignKey("student_tests.id", ondelete="SET NULL", use_alter=True, name="fk_learning_path_steps_step_test"), nullable=True
    )
    pass_score: Mapped[float] = mapped_column(Float, nullable=False, default=60.0, server_default="60")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    learning_path: Mapped[LearningPath] = relationship(back_populates="steps")
