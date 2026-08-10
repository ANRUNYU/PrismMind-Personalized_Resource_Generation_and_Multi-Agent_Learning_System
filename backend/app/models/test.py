from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Enum, Float, ForeignKey, Index, Integer, String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, JSONList, IdMixin, TimestampMixin, dict_default, list_default
from app.models.enums import PaperStatus, TestStatus

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.user import User


class StudentTest(IdMixin, TimestampMixin, Base):
    __tablename__ = "student_tests"
    __table_args__ = (
        Index("ix_student_tests_user_status_created_at", "user_id", "status", "created_at"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    topic: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    questions: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    answers: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    user_answers: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TestStatus] = mapped_column(
        Enum(TestStatus, name="test_status"),
        nullable=False,
        default=TestStatus.created,
        server_default=TestStatus.created.value,
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    learning_path_id: Mapped[int | None] = mapped_column(ForeignKey("learning_paths.id", ondelete="SET NULL"), nullable=True, index=True)
    learning_path_step_id: Mapped[int | None] = mapped_column(ForeignKey("learning_path_steps.id", ondelete="SET NULL"), nullable=True, index=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("learning_resources.id", ondelete="SET NULL"), nullable=True, index=True)
    source_type: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    evidence_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    source_file_ids: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    source_document_ids: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    source_chunk_ids: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    generation_parameters: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    quality_analysis: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    question_results: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)

    user: Mapped[User] = relationship()


class QuestionBank(IdMixin, TimestampMixin, Base):
    __tablename__ = "question_bank"
    __table_args__ = (
        Index("ix_question_bank_course_difficulty", "course_id", "difficulty"),
        Index("ix_question_bank_creator_created_at", "creator_id", "created_at"),
    )

    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    creator_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    question_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    difficulty: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    knowledge_points: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)

    course: Mapped[Course | None] = relationship(back_populates="questions")
    creator: Mapped[User | None] = relationship()
    paper_items: Mapped[list[PaperItem]] = relationship(back_populates="question")


class Paper(IdMixin, TimestampMixin, Base):
    __tablename__ = "papers"
    __table_args__ = (
        Index("ix_papers_creator_created_at", "creator_id", "created_at"),
        Index("ix_papers_course_status", "course_id", "status"),
    )

    creator_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    total_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0, server_default="100")
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty_ratio: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    status: Mapped[PaperStatus] = mapped_column(
        Enum(PaperStatus, name="paper_status"),
        nullable=False,
        default=PaperStatus.draft,
        server_default=PaperStatus.draft.value,
        index=True,
    )

    creator: Mapped[User | None] = relationship()
    course: Mapped[Course | None] = relationship(back_populates="papers")
    items: Mapped[list[PaperItem]] = relationship(back_populates="paper", cascade="all, delete-orphan")


class PaperItem(IdMixin, TimestampMixin, Base):
    __tablename__ = "paper_items"
    __table_args__ = (
        Index("ix_paper_items_paper_order", "paper_id", "order_index"),
    )

    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("question_bank.id", ondelete="RESTRICT"), nullable=False, index=True)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    paper: Mapped[Paper] = relationship(back_populates="items")
    question: Mapped[QuestionBank] = relationship(back_populates="paper_items")
