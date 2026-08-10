from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from pydantic import TypeAdapter

from app.core.config import Settings, get_settings
from app.services.llm.base import ChatMessage, LLMResponse, LLMStreamChunk, StreamChunkType, ToolDefinition
from app.services.llm.client import AliyunOpenAICompatibleClient
from app.services.llm.model_registry import AgentRole, ModelRegistration, ModelRegistry, model_registry


class FakeLLMClient:
    """Deterministic test provider; never performs network I/O."""
    async def chat(self, *, messages: list[ChatMessage], model: str, **_kwargs: Any) -> LLMResponse:
        content = next((message.content for message in reversed(messages) if message.content), "") or ""
        return LLMResponse(content=content, model=model, provider="fake", finish_reason="stop")

    async def stream_chat(self, *, messages: list[ChatMessage], model: str, **_kwargs: Any) -> AsyncIterator[LLMStreamChunk]:
        response = await self.chat(messages=messages, model=model)
        yield LLMStreamChunk(type=StreamChunkType.delta, delta=response.content)
        yield LLMStreamChunk(type=StreamChunkType.done, finish_reason="stop")

    async def structured_chat(self, *, schema: Any, messages: list[ChatMessage], model: str, **_kwargs: Any) -> LLMResponse:
        response = await self.chat(messages=messages, model=model)
        response.parsed = TypeAdapter(schema).validate_json(response.content)
        return response

    async def tool_chat(self, *, tools: list[ToolDefinition], messages: list[ChatMessage], model: str, **kwargs: Any) -> LLMResponse:
        return await self.chat(messages=messages, model=model, tools=tools, **kwargs)


class ModelRouter:
    def __init__(self, registry: ModelRegistry | None = None, client: Any | None = None, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.registry = registry or model_registry
        self.client = client or (FakeLLMClient() if self.settings.app_env == "test" else AliyunOpenAICompatibleClient(self.settings))

    def for_role(self, role: AgentRole | str) -> ModelRegistration:
        return self.registry.get(role)

    def _thinking(self, role: AgentRole, value: bool | None) -> bool:
        if value is not None:
            return value
        if role == AgentRole.PATH:
            return self.settings.agent_enable_thinking_path
        if role == AgentRole.TUTOR:
            return self.settings.agent_enable_thinking_tutor
        return False

    async def chat(self, *, role: AgentRole | str, messages: list[ChatMessage], enable_thinking: bool | None = None, **kwargs: Any) -> LLMResponse:
        registration = self.for_role(role)
        try:
            return await self.client.chat(messages=messages, model=registration.model_id,
                                          enable_thinking=self._thinking(registration.role, enable_thinking), **kwargs)
        except Exception:
            if not registration.fallback_model_id:
                raise
            response = await self.client.chat(
                messages=messages, model=registration.fallback_model_id,
                enable_thinking=self._thinking(registration.role, enable_thinking), **kwargs,
            )
            response.used_fallback = True
            return response

    async def stream_chat(self, *, role: AgentRole | str, messages: list[ChatMessage], enable_thinking: bool | None = None, **kwargs: Any) -> AsyncIterator[LLMStreamChunk]:
        registration = self.for_role(role)
        emitted = False
        try:
            async for chunk in self.client.stream_chat(messages=messages, model=registration.model_id,
                                                       enable_thinking=self._thinking(registration.role, enable_thinking), **kwargs):
                emitted = emitted or bool(chunk.delta)
                yield chunk
        except Exception:
            # Switching models after content was emitted would duplicate or splice an answer.
            if emitted or not registration.fallback_model_id:
                raise
            async for chunk in self.client.stream_chat(
                messages=messages, model=registration.fallback_model_id,
                enable_thinking=self._thinking(registration.role, enable_thinking), **kwargs,
            ):
                yield chunk

    async def tool_chat(self, *, role: AgentRole | str, messages: list[ChatMessage], tools: list[ToolDefinition],
                        tool_choice: str | dict[str, Any] = "auto", parallel_tool_calls: bool | None = None, **kwargs: Any) -> LLMResponse:
        registration = self.for_role(role)
        if not registration.capabilities.supports_tools:
            raise ValueError(f"Model {registration.model_id} does not support tool calling")
        return await self.client.tool_chat(messages=messages, model=registration.model_id, tools=tools,
                                           tool_choice=tool_choice, parallel_tool_calls=parallel_tool_calls,
                                           enable_thinking=False, **kwargs)

    async def structured_chat(self, *, role: AgentRole | str, messages: list[ChatMessage], schema: Any, **kwargs: Any) -> LLMResponse:
        registration = self.for_role(role)
        try:
            return await self.client.structured_chat(messages=messages, model=registration.model_id, schema=schema,
                                                     enable_thinking=False, **kwargs)
        except Exception:
            if not registration.fallback_model_id:
                raise
            response = await self.client.structured_chat(
                messages=messages, model=registration.fallback_model_id, schema=schema,
                enable_thinking=False, **kwargs,
            )
            response.used_fallback = True
            if not response.model:
                response.model = registration.fallback_model_id
            return response


router = ModelRouter()
