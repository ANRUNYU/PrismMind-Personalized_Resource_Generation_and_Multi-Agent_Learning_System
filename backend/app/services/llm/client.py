from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any, TypeVar

from openai import AsyncOpenAI
from pydantic import TypeAdapter, ValidationError

from app.core.config import Settings, get_settings
from app.services.llm.base import (
    ChatMessage, LLMClientError, LLMRequest, LLMResponse, LLMStreamChunk, LLMUsage,
    StreamChunkType, StructuredOutputError, ToolCall, ToolDefinition,
)

logger = logging.getLogger(__name__)
T = TypeVar("T")


class AliyunOpenAICompatibleClient:
    def __init__(self, settings: Settings | None = None, sdk_client: Any | None = None) -> None:
        self.settings = settings or get_settings()
        self._sdk_client = sdk_client

    def _client(self) -> AsyncOpenAI:
        if self._sdk_client is not None:
            return self._sdk_client
        if not self.settings.dashscope_api_key:
            raise LLMClientError("DASHSCOPE_API_KEY is not configured")
        self._sdk_client = AsyncOpenAI(
            api_key=self.settings.dashscope_api_key,
            base_url=self.settings.dashscope_base_url,
            timeout=self.settings.llm_request_timeout_seconds,
            max_retries=self.settings.llm_max_retries,
        )
        return self._sdk_client

    @staticmethod
    def _message_payload(messages: list[ChatMessage]) -> list[dict[str, Any]]:
        return [message.model_dump(exclude_none=True) for message in messages]

    @staticmethod
    def _tool_calls(raw_calls: Any) -> list[ToolCall]:
        calls: list[ToolCall] = []
        for call in raw_calls or []:
            raw_arguments = getattr(getattr(call, "function", None), "arguments", "{}") or "{}"
            try:
                arguments = json.loads(raw_arguments)
            except json.JSONDecodeError:
                arguments = {"_invalid_json": raw_arguments}
            calls.append(ToolCall(id=str(call.id), name=str(call.function.name), arguments=arguments))
        return calls

    @staticmethod
    def _json_candidate(content: str) -> str:
        candidate = content.strip()
        if candidate.startswith("```"):
            first_newline = candidate.find("\n")
            closing_fence = candidate.rfind("```")
            if first_newline >= 0 and closing_fence > first_newline:
                candidate = candidate[first_newline + 1:closing_fence].strip()
        if not candidate.startswith("{") or not candidate.endswith("}"):
            start = candidate.find("{")
            end = candidate.rfind("}")
            if start >= 0 and end > start:
                candidate = candidate[start:end + 1]
        return candidate

    def _kwargs(self, request: LLMRequest, *, stream: bool = False) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": request.model, "messages": self._message_payload(request.messages),
            "stream": stream,
        }
        for key in ("temperature", "max_tokens", "tool_choice", "parallel_tool_calls", "response_format", "timeout"):
            value = getattr(request, key)
            if value is not None:
                kwargs[key] = value
        if request.tools:
            kwargs["tools"] = [tool.as_openai() for tool in request.tools]
        if request.enable_thinking:
            kwargs["extra_body"] = {"enable_thinking": True}
        return kwargs

    async def chat(self, *, messages: list[ChatMessage], model: str, temperature: float | None = None,
                   max_tokens: int | None = None, tools: list[ToolDefinition] | None = None,
                   tool_choice: str | dict[str, Any] | None = None, parallel_tool_calls: bool | None = None,
                   enable_thinking: bool = False, response_format: dict[str, Any] | None = None,
                   timeout: float | None = None) -> LLMResponse:
        request = LLMRequest(messages=messages, model=model, temperature=temperature, max_tokens=max_tokens,
                             tools=tools or [], tool_choice=tool_choice, parallel_tool_calls=parallel_tool_calls,
                             enable_thinking=enable_thinking, response_format=response_format, timeout=timeout)
        started = time.perf_counter()
        try:
            raw = await self._client().chat.completions.create(**self._kwargs(request))
            choice = raw.choices[0]
            return LLMResponse(
                content=choice.message.content or "", model=raw.model or model, provider="dashscope",
                finish_reason=choice.finish_reason, tool_calls=self._tool_calls(choice.message.tool_calls),
                usage=LLMUsage(**raw.usage.model_dump()) if getattr(raw, "usage", None) else None,
                latency_ms=round((time.perf_counter() - started) * 1000, 2), request_id=getattr(raw, "id", None),
            )
        except Exception as exc:
            logger.warning("LLM request failed provider=dashscope model=%s error_type=%s", model, type(exc).__name__)
            raise LLMClientError(f"LLM request failed: {type(exc).__name__}") from exc

    async def stream_chat(self, **kwargs: Any) -> AsyncIterator[LLMStreamChunk]:
        request = LLMRequest(**kwargs)
        try:
            stream = await self._client().chat.completions.create(**self._kwargs(request, stream=True), stream_options={"include_usage": True})
            async for raw in stream:
                if getattr(raw, "usage", None):
                    yield LLMStreamChunk(type=StreamChunkType.usage, usage=LLMUsage(**raw.usage.model_dump()))
                for choice in raw.choices or []:
                    delta = choice.delta
                    if getattr(delta, "content", None):
                        yield LLMStreamChunk(type=StreamChunkType.delta, delta=delta.content)
                    for call in getattr(delta, "tool_calls", None) or []:
                        function = getattr(call, "function", None)
                        yield LLMStreamChunk(type=StreamChunkType.tool_call_delta, tool_call=ToolCall(
                            id=str(getattr(call, "id", "") or ""), name=str(getattr(function, "name", "") or ""),
                            arguments={"delta": str(getattr(function, "arguments", "") or "")},
                        ))
                    if choice.finish_reason:
                        yield LLMStreamChunk(type=StreamChunkType.done, finish_reason=choice.finish_reason)
        except Exception as exc:
            logger.warning("LLM stream failed provider=dashscope model=%s error_type=%s", request.model, type(exc).__name__)
            yield LLMStreamChunk(type=StreamChunkType.error, error=f"LLM stream interrupted: {type(exc).__name__}")

    async def structured_chat(self, *, schema: Any, **kwargs: Any) -> LLMResponse:
        adapter = TypeAdapter(schema)
        messages = list(kwargs.pop("messages"))
        schema_json = json.dumps(adapter.json_schema(), ensure_ascii=False, separators=(",", ":"))
        messages.insert(
            0,
            ChatMessage(
                role="system",
                content=(
                    "Return exactly one valid JSON object. Do not wrap it in Markdown. "
                    f"The JSON must satisfy this JSON Schema: {schema_json}"
                ),
            ),
        )
        last_error: Exception | None = None
        for attempt in range(2):
            response = await self.chat(messages=messages, response_format={"type": "json_object"}, **kwargs)
            try:
                response.parsed = adapter.validate_json(self._json_candidate(response.content))
                return response
            except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                last_error = exc
                if attempt == 0:
                    messages.extend([
                        ChatMessage(role="assistant", content=response.content),
                        ChatMessage(role="user", content="The JSON failed schema validation. Return one corrected JSON object only."),
                    ])
        raise StructuredOutputError(f"Structured output validation failed: {type(last_error).__name__}")

    async def tool_chat(self, *, tools: list[ToolDefinition], tool_choice: str | dict[str, Any] = "auto", **kwargs: Any) -> LLMResponse:
        return await self.chat(tools=tools, tool_choice=tool_choice, **kwargs)
