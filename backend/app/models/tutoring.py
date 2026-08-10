from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Float, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONList, IdMixin, TimestampMixin, list_default

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.user import User


class TutoringSession(IdMixin, TimestampMixin, Base):
    __tablename__ = "tutoring_sessions"
    __table_args__ = (
        Index("ix_tutoring_sessions_user_created_at", "user_id", "created_at"),
        Index("ix_tutoring_sessions_course_topic", "course_id", "topic"),
    )

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    topic: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    session_type: Mapped[str] = mapped_column(String(80), nullable=False, default="qa", server_default="qa")
    user_question: Mapped[str] = mapped_column(Text, nullable=False)
    ai_response: Mapped[str] = mapped_column(Text, nullable=False)
    response_format: Mapped[str] = mapped_column(String(40), nullable=False, default="markdown", server_default="markdown")
    context_refs: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    is_helpful: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    user_rating: Mapped[float | None] = mapped_column(Float, nullable=True)

    user: Mapped[User] = relationship()
    course: Mapped[Course | None] = relationship(back_populates="tutoring_sessions")


class TutoringConversation(IdMixin, TimestampMixin, Base):
    __tablename__ = "tutoring_conversations"
    __table_args__ = (Index("ix_tutoring_conversations_user_updated", "user_id", "updated_at"),)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    messages: Mapped[list[TutoringMessage]] = relationship(back_populates="conversation", cascade="all, delete-orphan", order_by="TutoringMessage.id")


class TutoringMessage(IdMixin, TimestampMixin, Base):
    __tablename__ = "tutoring_messages"
    __table_args__ = (
        Index("ix_tutoring_messages_conversation_created", "conversation_id", "created_at"),
        UniqueConstraint("conversation_id", "client_message_id", name="uq_tutoring_message_client_key"),
    )
    conversation_id: Mapped[int] = mapped_column(ForeignKey("tutoring_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="completed", server_default="completed")
    references: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    warnings: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    conversation: Mapped[TutoringConversation] = relationship(back_populates="messages")
