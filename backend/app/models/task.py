from __future__ import annotations

from typing import TYPE_CHECKING, Any

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, IdMixin, TimestampMixin, dict_default
from app.models.enums import TaskStatus

if TYPE_CHECKING:
    from app.models.artifact import GeneratedArtifact
    from app.models.user import User


class GenerationTask(IdMixin, TimestampMixin, Base):
    __tablename__ = "generation_tasks"
    __table_args__ = (
        Index("ix_generation_tasks_owner_status_created_at", "owner_id", "status", "created_at"),
        Index("ix_generation_tasks_type_status", "task_type", "status"),
    )

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status"),
        nullable=False,
        default=TaskStatus.pending,
        server_default=TaskStatus.pending.value,
        index=True,
    )
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    input_payload: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    result_payload: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    current_stage: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    partial_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_artifact_id: Mapped[int | None] = mapped_column(
        ForeignKey("generated_artifacts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner: Mapped[User] = relationship(back_populates="generation_tasks")
    result_artifact: Mapped[GeneratedArtifact | None] = relationship(back_populates="generation_tasks")


class AuditLog(IdMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_user_created_at", "user_id", "created_at"),
        Index("ix_audit_logs_resource", "resource_type", "resource_id"),
    )

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    resource_type: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    resource_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user: Mapped[User | None] = relationship(back_populates="audit_logs")
