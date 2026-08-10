from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, JSONList, IdMixin, TimestampMixin, dict_default, list_default

if TYPE_CHECKING:
    from app.models.learning_path import LearningPath
    from app.models.resource import LearningResource
    from app.models.test import StudentTest
    from app.models.user import User


class LearningAssessment(IdMixin, TimestampMixin, Base):
    __tablename__ = "learning_assessments"
    __table_args__ = (
        Index("ix_learning_assessments_user_created_at", "user_id", "created_at"),
        Index("ix_learning_assessments_topic_type", "topic", "assessment_type"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("learning_resources.id", ondelete="SET NULL"), nullable=True, index=True)
    path_id: Mapped[int | None] = mapped_column(ForeignKey("learning_paths.id", ondelete="SET NULL"), nullable=True, index=True)
    test_id: Mapped[int | None] = mapped_column(ForeignKey("student_tests.id", ondelete="SET NULL"), nullable=True, index=True)
    assessment_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    topic: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    correct_topics: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    incorrect_topics: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendations: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    answers: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    reflection: Mapped[str | None] = mapped_column(Text, nullable=True)
    self_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()
    resource: Mapped[LearningResource | None] = relationship(back_populates="assessments")
    learning_path: Mapped[LearningPath | None] = relationship(back_populates="assessments")
    test: Mapped[StudentTest | None] = relationship()
