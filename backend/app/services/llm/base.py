from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None = None
    name: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[dict[str, Any]] | None = None


class ToolDefinition(BaseModel):
    name: str
    description: str = ""
    parameters: dict[str, Any] = Field(default_factory=lambda: {"type": "object", "properties": {}})

    def as_openai(self) -> dict[str, Any]:
        return {"type": "function", "function": self.model_dump()}


class ToolCall(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any]


class LLMUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMRequest(BaseModel):
    messages: list[ChatMessage]
    model: str
    temperature: float | None = None
    max_tokens: int | None = None
    tools: list[ToolDefinition] = Field(default_factory=list)
    tool_choice: str | dict[str, Any] | None = None
    parallel_tool_calls: bool | None = None
    enable_thinking: bool = False
    response_format: dict[str, Any] | None = None
    timeout: float | None = None


class LLMResponse(BaseModel):
    content: str = ""
    model: str
    provider: str
    finish_reason: str | None = None
    tool_calls: list[ToolCall] = Field(default_factory=list)
    usage: LLMUsage | None = None
    latency_ms: float = 0
    request_id: str | None = None
    used_fallback: bool = False
    error: str | None = None
    parsed: Any | None = None


class StreamChunkType(StrEnum):
    delta = "delta"
    tool_call_delta = "tool_call_delta"
    usage = "usage"
    done = "done"
    error = "error"


class LLMStreamChunk(BaseModel):
    type: StreamChunkType
    delta: str = ""
    tool_call: ToolCall | None = None
    usage: LLMUsage | None = None
    finish_reason: str | None = None
    error: str | None = None


class LLMClientError(RuntimeError):
    pass


class StructuredOutputError(LLMClientError):
    pass
