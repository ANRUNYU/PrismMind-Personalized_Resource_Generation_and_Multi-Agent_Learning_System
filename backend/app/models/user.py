from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import IdMixin, TimestampMixin
from app.models.enums import UserRole

if TYPE_CHECKING:
    from app.models.agent_run import AgentRun
    from app.models.assistant import AssistantSession
    from app.models.artifact import GeneratedArtifact
    from app.models.assignment import CourseAssignment, CourseAssignmentSubmission
    from app.models.course import Course, CourseMember
    from app.models.file_asset import FileAsset
    from app.models.profile import StudentProfile
    from app.models.task import AuditLog, GenerationTask
    from app.models.student_exercise import StudentExercise


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_role_created_at", "role", "created_at"),
    )

    username: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"),
        nullable=False,
        default=UserRole.student,
        server_default=UserRole.student.value,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    courses: Mapped[list[Course]] = relationship(back_populates="owner")
    course_members: Mapped[list[CourseMember]] = relationship(back_populates="user", cascade="all, delete-orphan")
    artifacts: Mapped[list[GeneratedArtifact]] = relationship(back_populates="owner")
    profile: Mapped[StudentProfile | None] = relationship(back_populates="user")
    files: Mapped[list[FileAsset]] = relationship(back_populates="owner")
    generation_tasks: Mapped[list[GenerationTask]] = relationship(back_populates="owner")
    agent_runs: Mapped[list[AgentRun]] = relationship(back_populates="user")
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="user")
    course_assignments: Mapped[list[CourseAssignment]] = relationship(back_populates="teacher")
    course_assignment_submissions: Mapped[list[CourseAssignmentSubmission]] = relationship(back_populates="student")
    assistant_sessions: Mapped[list[AssistantSession]] = relationship(back_populates="user", cascade="all, delete-orphan")
    student_exercises: Mapped[list[StudentExercise]] = relationship(back_populates="student", cascade="all, delete-orphan")
