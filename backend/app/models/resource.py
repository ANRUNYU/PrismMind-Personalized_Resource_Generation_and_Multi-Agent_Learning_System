from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, JSONList, IdMixin, TimestampMixin, dict_default, list_default

if TYPE_CHECKING:
    from app.models.assessment import LearningAssessment
    from app.models.course import Course
    from app.models.profile import StudentProfile
    from app.models.user import User


class LearningResource(IdMixin, TimestampMixin, Base):
    __tablename__ = "learning_resources"
    __table_args__ = (
        Index("ix_learning_resources_user_created_at", "user_id", "created_at"),
        Index("ix_learning_resources_course_topic", "course_id", "topic"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    profile_id: Mapped[int | None] = mapped_column(ForeignKey("student_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    topic: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    difficulty_level: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    tags: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    is_viewed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    user_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONDict, nullable=True, default=dict_default)
    profile_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONDict, nullable=True)
    reference_snapshot: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    generation_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("generation_tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    generation_parameters: Mapped[dict[str, Any] | None] = mapped_column(JSONDict, nullable=True)

    user: Mapped[User] = relationship()
    profile: Mapped[StudentProfile | None] = relationship(back_populates="resources")
    course: Mapped[Course | None] = relationship(back_populates="resources")
    assessments: Mapped[list[LearningAssessment]] = relationship(back_populates="resource")
