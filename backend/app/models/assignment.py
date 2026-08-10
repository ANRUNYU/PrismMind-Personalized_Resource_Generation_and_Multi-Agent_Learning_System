from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, JSONList, IdMixin, TimestampMixin, dict_default, list_default

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.user import User


class CourseAssignment(IdMixin, TimestampMixin, Base):
    __tablename__ = "course_assignments"
    __table_args__ = (
        Index("ix_course_assignments_course_status", "course_id", "status"),
        Index("ix_course_assignments_teacher_created_at", "teacher_id", "created_at"),
    )

    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignment_type: Mapped[str] = mapped_column(String(32), nullable=False, default="quiz", server_default="quiz", index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="ai_generated", server_default="ai_generated")
    difficulty: Mapped[str] = mapped_column(String(40), nullable=False, default="medium", server_default="medium", index=True)
    topic: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    total_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0, server_default="100")
    time_limit_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="published", server_default="published", index=True)
    knowledge_document_ids: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    questions: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    answer_key: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    explanations: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped[Course] = relationship(back_populates="assignments")
    teacher: Mapped[User | None] = relationship(back_populates="course_assignments")
    submissions: Mapped[list[CourseAssignmentSubmission]] = relationship(
        back_populates="assignment",
        cascade="all, delete-orphan",
    )


class CourseAssignmentSubmission(IdMixin, TimestampMixin, Base):
    __tablename__ = "course_assignment_submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_course_assignment_submissions_assignment_student"),
        Index("ix_course_assignment_submissions_course_student", "course_id", "student_id"),
        Index("ix_course_assignment_submissions_assignment_status", "assignment_id", "status"),
    )

    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("course_assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    answers: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0, server_default="100")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_started", server_default="not_started", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    feedback: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    question_results: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)

    assignment: Mapped[CourseAssignment] = relationship(back_populates="submissions")
    course: Mapped[Course] = relationship()
    student: Mapped[User | None] = relationship(back_populates="course_assignment_submissions")
