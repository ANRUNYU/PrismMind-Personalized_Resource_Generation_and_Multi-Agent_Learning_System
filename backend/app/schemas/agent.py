from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class AgentExecuteRequest(BaseModel):
    query: str = Field(min_length=2, max_length=4000)
    course_id: int | None = None
    document_ids: list[int] | None = None
    allow_general_knowledge: bool = False
    top_k: int = Field(default=5, ge=1, le=20)
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentRunRead(BaseModel):
    run_id: str
    parent_run_id: str | None = None
    agent_role: str
    status: str
    model_name: str | None = None
    provider: str | None = None
    latency_ms: float | None = None
    token_usage: dict[str, int] = Field(default_factory=dict)
    evidence_count: int = 0
    verifier_decision: str | None = None
    content: str = ""
    citations: list[dict[str, Any]] = Field(default_factory=list)
    evidence_status: str | None = None
    warnings: list[str] = Field(default_factory=list)
    children: list["AgentRunRead"] = Field(default_factory=list)
