"""Public LLM client, routing, and legacy compatibility exports."""

from app.services.llm.base import (
    ChatMessage,
    LLMRequest,
    LLMResponse,
    LLMStreamChunk,
    LLMUsage,
    StructuredOutputError,
    ToolCall,
    ToolDefinition,
)
from app.services.llm.provider import LLMProvider, LLMProviderError, LLMResult, LLMStreamUnsupportedError, llm_provider
from app.services.llm.router import ModelRouter, router

__all__ = [
    "ChatMessage",
    "LLMProvider",
    "LLMProviderError",
    "LLMRequest",
    "LLMResponse",
    "LLMResult",
    "LLMStreamChunk",
    "LLMStreamUnsupportedError",
    "LLMUsage",
    "ModelRouter",
    "StructuredOutputError",
    "ToolCall",
    "ToolDefinition",
    "llm_provider",
    "router",
]
