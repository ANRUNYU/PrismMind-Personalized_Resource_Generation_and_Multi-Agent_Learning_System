from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from app.core.config import Settings
from app.services.llm.base import ChatMessage, StreamChunkType, StructuredOutputError, ToolDefinition
from app.services.llm.client import AliyunOpenAICompatibleClient
from app.services.llm.model_registry import AgentRole, ModelRegistry
from app.services.llm.provider import LLMProvider, LLMProviderError
from app.services.llm.router import ModelRouter


class FakeCompletions:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def sdk_with(*responses):
    completions = FakeCompletions(responses)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions)), completions


def response(content="ok", *, tool_calls=None, reasoning_content=None):
    message = SimpleNamespace(content=content, tool_calls=tool_calls or [], reasoning_content=reasoning_content)
    return SimpleNamespace(
        id="req-1", model="model-returned", choices=[SimpleNamespace(message=message, finish_reason="stop")], usage=None,
    )


@pytest.mark.anyio
async def test_router_uses_different_models_and_preserves_multiturn_messages():
    class CaptureClient:
        def __init__(self): self.calls = []
        async def chat(self, **kwargs):
            self.calls.append(kwargs)
            return SimpleNamespace(model=kwargs["model"], content="ok")
    capture = CaptureClient()
    router = ModelRouter(registry=ModelRegistry(Settings(_env_file=None)), client=capture, settings=Settings(_env_file=None))
    messages = [ChatMessage(role="user", content="first"), ChatMessage(role="assistant", content="answer"), ChatMessage(role="user", content="next")]
    tutor = await router.chat(role=AgentRole.TUTOR, messages=messages)
    test = await router.chat(role=AgentRole.TEST, messages=messages)
    assert tutor.model == "qwen3-max"
    assert test.model == "deepseek-v3"
    assert capture.calls[0]["messages"] == messages


@pytest.mark.anyio
async def test_chat_parses_tool_calls_parallel_and_hides_reasoning():
    calls = [
        SimpleNamespace(id="one", function=SimpleNamespace(name="lookup", arguments='{"id":1}')),
        SimpleNamespace(id="two", function=SimpleNamespace(name="lookup", arguments='{"id":2}')),
    ]
    sdk, completions = sdk_with(response("visible", tool_calls=calls, reasoning_content="private chain"))
    client = AliyunOpenAICompatibleClient(Settings(_env_file=None), sdk)
    result = await client.tool_chat(
        messages=[ChatMessage(role="user", content="lookup")], model="qwen3-max",
        tools=[ToolDefinition(name="lookup", parameters={"type": "object", "properties": {"id": {"type": "integer"}}})],
        tool_choice="required", parallel_tool_calls=True,
    )
    assert [call.arguments["id"] for call in result.tool_calls] == [1, 2]
    assert completions.calls[0]["parallel_tool_calls"] is True
    assert "private chain" not in result.model_dump_json()


class StructuredAnswer(BaseModel):
    title: str
    score: int


@pytest.mark.anyio
async def test_structured_chat_accepts_fenced_json_only_after_schema_validation():
    sdk, completions = sdk_with(response('```json\n{"title":"ok","score":3}\n```'))
    client = AliyunOpenAICompatibleClient(Settings(_env_file=None), sdk)
    result = await client.structured_chat(
        schema=StructuredAnswer, messages=[ChatMessage(role="user", content="build answer")], model="deepseek-v3",
    )
    assert result.parsed == StructuredAnswer(title="ok", score=3)
    assert len(completions.calls) == 1


@pytest.mark.anyio
async def test_structured_chat_validates_and_repairs_once():
    sdk, completions = sdk_with(response("not-json"), response('{"title":"ok","score":3}'))
    client = AliyunOpenAICompatibleClient(Settings(_env_file=None), sdk)
    result = await client.structured_chat(
        schema=StructuredAnswer, messages=[ChatMessage(role="user", content="build answer")], model="deepseek-v3",
    )
    assert result.parsed == StructuredAnswer(title="ok", score=3)
    assert len(completions.calls) == 2
    assert "JSON Schema" in completions.calls[0]["messages"][0]["content"]


@pytest.mark.anyio
async def test_structured_chat_rejects_invalid_json_after_one_repair():
    sdk, _ = sdk_with(response("bad"), response('{"title":4}'))
    client = AliyunOpenAICompatibleClient(Settings(_env_file=None), sdk)
    with pytest.raises(StructuredOutputError):
        await client.structured_chat(schema=StructuredAnswer, messages=[ChatMessage(role="user", content="json")], model="deepseek-v3")


@pytest.mark.anyio
async def test_stream_emits_real_deltas_and_normalizes_interruption():
    class Stream:
        def __init__(self, broken=False): self.index = 0; self.broken = broken
        def __aiter__(self): return self
        async def __anext__(self):
            self.index += 1
            if self.broken and self.index == 2: raise ConnectionError("secret transport detail")
            if self.index > 2: raise StopAsyncIteration
            delta = SimpleNamespace(content=f"part-{self.index}", tool_calls=[])
            return SimpleNamespace(usage=None, choices=[SimpleNamespace(delta=delta, finish_reason=None)])
    sdk, _ = sdk_with(Stream())
    client = AliyunOpenAICompatibleClient(Settings(_env_file=None), sdk)
    chunks = [chunk async for chunk in client.stream_chat(messages=[ChatMessage(role="user", content="go")], model="qwen3-max")]
    assert [chunk.delta for chunk in chunks if chunk.type == StreamChunkType.delta] == ["part-1", "part-2"]
    sdk, _ = sdk_with(Stream(broken=True))
    client = AliyunOpenAICompatibleClient(Settings(_env_file=None), sdk)
    chunks = [chunk async for chunk in client.stream_chat(messages=[ChatMessage(role="user", content="go")], model="qwen3-max")]
    assert chunks[-1].type == StreamChunkType.error


def test_production_legacy_provider_does_not_silently_mock(monkeypatch):
    provider = LLMProvider()
    monkeypatch.setattr(provider.settings, "app_env", "production")
    monkeypatch.setattr(provider.settings, "llm_provider", "dashscope")
    monkeypatch.setattr(provider.settings, "dashscope_api_key", "")
    with pytest.raises(LLMProviderError):
        provider.generate_text("hello", fallback="must not be returned")


@pytest.mark.anyio
async def test_api_key_is_not_logged(caplog):
    sdk, _ = sdk_with(RuntimeError("sk-this-key-must-not-be-logged"))
    client = AliyunOpenAICompatibleClient(Settings(_env_file=None), sdk)
    with pytest.raises(Exception):
        await client.chat(messages=[ChatMessage(role="user", content="go")], model="qwen3-max")
    assert "sk-this-key-must-not-be-logged" not in caplog.text
