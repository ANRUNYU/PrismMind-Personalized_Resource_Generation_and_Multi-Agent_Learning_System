from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, JSONList, IdMixin, TimestampMixin, dict_default, list_default

if TYPE_CHECKING:
    from app.models.user import User


class StudentExercise(IdMixin, TimestampMixin, Base):
    __tablename__ = "student_exercises"
    __table_args__ = (
        Index("ix_student_exercises_student_status", "student_id", "status"),
        Index("ix_student_exercises_student_favorite", "student_id", "is_favorite"),
        Index("ix_student_exercises_student_updated_at", "student_id", "updated_at"),
    )

    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    difficulty: Mapped[str] = mapped_column(String(40), nullable=False, default="medium", server_default="medium", index=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False, default="个人习题", server_default="个人习题", index=True)
    tags: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_started", server_default="not_started", index=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false", index=True)
    total_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0, server_default="100")
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_results: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    quality_analysis: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    student: Mapped[User] = relationship(back_populates="student_exercises")
