from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, JSONList, IdMixin, TimestampMixin, dict_default, list_default
from app.models.enums import AgentRunStatus

if TYPE_CHECKING:
    from app.models.user import User


class AgentRun(IdMixin, TimestampMixin, Base):
    __tablename__ = "agent_runs"
    __table_args__ = (
        Index("ix_agent_runs_user_created_at", "user_id", "created_at"),
        Index("ix_agent_runs_agent_status", "agent_type", "status"),
    )

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_run_id: Mapped[int | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=True, index=True)
    run_uuid: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    agent_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    input_payload: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    output_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONDict, nullable=True)
    status: Mapped[AgentRunStatus] = mapped_column(
        Enum(AgentRunStatus, name="agent_run_status"),
        nullable=False,
        default=AgentRunStatus.pending,
        server_default=AgentRunStatus.pending.value,
        index=True,
    )
    trace: Mapped[list[Any]] = mapped_column(JSONList, nullable=False, default=list_default)
    model_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    token_usage: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    verifier_decision: Mapped[str | None] = mapped_column(String(40), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User | None] = relationship(back_populates="agent_runs")
