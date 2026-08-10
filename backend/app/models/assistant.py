from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONList, IdMixin, TimestampMixin, list_default

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.user import User


class AssistantSession(IdMixin, TimestampMixin, Base):
    __tablename__ = "assistant_sessions"
    __table_args__ = (
        Index("ix_assistant_sessions_user_updated_at", "user_id", "updated_at"),
        Index("ix_assistant_sessions_course_user", "course_id", "user_id"),
        Index("ix_assistant_sessions_user_status", "user_id", "status"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False, default="New assistant chat", server_default="New assistant chat")
    mode: Mapped[str] = mapped_column(String(32), nullable=False, default="general", server_default="general", index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active", server_default="active", index=True)

    user: Mapped[User] = relationship(back_populates="assistant_sessions")
    course: Mapped[Course | None] = relationship(back_populates="assistant_sessions")
    messages: Mapped[list[AssistantMessage]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="AssistantMessage.created_at",
    )


class AssistantMessage(IdMixin, TimestampMixin, Base):
    __tablename__ = "assistant_messages"
    __table_args__ = (
        Index("ix_assistant_messages_session_created_at", "session_id", "created_at"),
        Index("ix_assistant_messages_role_created_at", "role", "created_at"),
    )

    session_id: Mapped[int] = mapped_column(ForeignKey("assistant_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="completed", server_default="completed", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    references: Mapped[list[dict[str, Any]]] = mapped_column(JSONList, nullable=False, default=list_default)
    attachment_file_ids: Mapped[list[int]] = mapped_column(JSONList, nullable=False, default=list_default)

    session: Mapped[AssistantSession] = relationship(back_populates="messages")
