from __future__ import annotations

from pydantic import BaseModel, Field
from datetime import datetime


class AgentModelStatus(BaseModel):
    role: str
    configured_model: str
    configured: bool
    last_probe_status: str | None = None
    last_probe_at: datetime | None = None
    provider: str


class LLMStatusResponse(BaseModel):
    provider: str
    model: str
    real_provider_enabled: bool
    fallback_enabled: bool
    configured: bool
    message: str
    roles: list[AgentModelStatus] = Field(default_factory=list)
