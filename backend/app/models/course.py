from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import IdMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.assignment import CourseAssignment
    from app.models.assistant import AssistantSession
    from app.models.knowledge import KnowledgeDocument
    from app.models.resource import LearningResource
    from app.models.test import Paper, QuestionBank
    from app.models.tutoring import TutoringSession
    from app.models.user import User


class Course(IdMixin, TimestampMixin, Base):
    __tablename__ = "courses"
    __table_args__ = (
        Index("ix_courses_owner_created_at", "owner_id", "created_at"),
        Index("ix_courses_status_created_at", "status", "created_at"),
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", server_default="active", index=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    owner: Mapped[User | None] = relationship(back_populates="courses")
    members: Mapped[list[CourseMember]] = relationship(back_populates="course", cascade="all, delete-orphan")
    resources: Mapped[list[LearningResource]] = relationship(back_populates="course")
    questions: Mapped[list[QuestionBank]] = relationship(back_populates="course")
    papers: Mapped[list[Paper]] = relationship(back_populates="course")
    tutoring_sessions: Mapped[list[TutoringSession]] = relationship(back_populates="course")
    knowledge_documents: Mapped[list[KnowledgeDocument]] = relationship(back_populates="course")
    assignments: Mapped[list[CourseAssignment]] = relationship(back_populates="course", cascade="all, delete-orphan")
    assistant_sessions: Mapped[list[AssistantSession]] = relationship(back_populates="course")


class CourseMember(IdMixin, TimestampMixin, Base):
    __tablename__ = "course_members"
    __table_args__ = (
        UniqueConstraint("course_id", "user_id", name="uq_course_members_course_id_user_id"),
        Index("ix_course_members_course_role_status", "course_id", "role", "status"),
        Index("ix_course_members_user_status", "user_id", "status"),
    )

    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", server_default="active", index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    course: Mapped[Course] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="course_members")
