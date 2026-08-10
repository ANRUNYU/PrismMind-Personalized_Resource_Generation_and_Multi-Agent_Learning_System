from __future__ import annotations

# ruff: noqa: F811

import asyncio

import pytest

from app.services.llm.provider import LLMProvider, LLMProviderError
from test_course_flow import auth, client, register_and_login  # noqa: F401


def test_llm_mock_provider_returns_chinese_fallback(monkeypatch):
    provider = LLMProvider()
    monkeypatch.setattr(provider.settings, "llm_provider", "mock")

    result = provider.generate_text("请生成一段课程建议")

    assert result.provider == "mock"
    assert result.model_name == "mock-local"
    assert "教学内容生成结果" in result.content


def test_llm_missing_dashscope_key_falls_back_without_crashing(monkeypatch):
    provider = LLMProvider()
    monkeypatch.setattr(provider.settings, "llm_provider", "dashscope")
    monkeypatch.setattr(provider.settings, "dashscope_api_key", "")

    result = provider.generate_text("请生成课程设计", fallback="本地兜底内容")

    assert result.content == "本地兜底内容"
    assert result.used_fallback is True
    assert "DASHSCOPE_API_KEY" in (result.error_message or "")


def test_llm_status_endpoint_requires_login_and_returns_status(client):
    unauthorized = client.get("/api/v1/llm/status")
    assert unauthorized.status_code == 401

    token = register_and_login(client, "llm_status_teacher", "teacher")
    response = client.get("/api/v1/llm/status", headers=auth(token))

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["provider"] in {"mock", "dashscope", "openai_compatible"}
    assert data["fallback_enabled"] is True
    assert "message" in data
    assert len(data["roles"]) == 8
    serialized = response.text
    assert "DASHSCOPE_API_KEY" not in serialized
    assert "Authorization" not in serialized
    assert "dashscope.aliyuncs.com" not in serialized


def test_stream_text_returns_real_chunks(monkeypatch):
    provider = LLMProvider()
    monkeypatch.setattr(provider.settings, "llm_provider", "openai_compatible")
    monkeypatch.setattr(provider.settings, "openai_api_key", "fake-key")
    monkeypatch.setattr(provider.settings, "llm_base_url", "https://example.invalid/v1")
    monkeypatch.setattr(provider, "_stream_openai_compatible", lambda *args, **kwargs: iter(["第一块", "第二块"]))

    async def collect():
        return [chunk async for chunk in provider.stream_text("测试")]

    assert asyncio.run(collect()) == ["第一块", "第二块"]


def test_stream_text_normalizes_midstream_error(monkeypatch):
    provider = LLMProvider()
    monkeypatch.setattr(provider.settings, "llm_provider", "openai_compatible")
    monkeypatch.setattr(provider.settings, "openai_api_key", "fake-key")
    monkeypatch.setattr(provider.settings, "llm_base_url", "https://example.invalid/v1")
    def broken_stream(*args, **kwargs):
        yield "第一块"
        raise ConnectionError("断流")
    monkeypatch.setattr(provider, "_stream_openai_compatible", broken_stream)

    async def collect():
        return [chunk async for chunk in provider.stream_text("测试")]

    with pytest.raises(LLMProviderError, match="stream interrupted"):
        asyncio.run(collect())
