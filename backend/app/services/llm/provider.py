from __future__ import annotations

import json
import logging
import time
import asyncio
from dataclasses import dataclass
from collections.abc import AsyncIterator, Iterator
from typing import Any
from openai import OpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = {"mock", "dashscope", "openai_compatible"}
DEFAULT_SYSTEM_PROMPT = (
    "你是棱镜智教-PrismMind 的教学智能体。请始终使用中文回答，内容要具体、结构化、"
    "适合教学演示。不要输出内部 ID，不要编造资料来源；如果资料不足，请明确说明不确定性。"
)


@dataclass
class LLMResult:
    content: str
    model_name: str
    token_usage: dict[str, Any] | None = None
    provider: str = "mock"
    used_fallback: bool = False
    error_message: str | None = None


class LLMProviderError(RuntimeError):
    """Normalized provider failure safe for task error reporting."""


class LLMStreamUnsupportedError(LLMProviderError):
    pass


class LLMProvider:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def provider_name(self) -> str:
        return (self.settings.llm_provider or "mock").lower().strip() or "mock"

    @property
    def model_name(self) -> str:
        return (self.settings.llm_model or "qwen-plus").strip() or "qwen-plus"

    def is_real_provider_enabled(self) -> bool:
        return self.provider_name in {"dashscope", "openai_compatible"} and self._configuration_error() is None

    @property
    def stream_supported(self) -> bool:
        return self.provider_name in {"dashscope", "openai_compatible"} and self._configuration_error() is None

    def get_provider_status(self) -> dict[str, Any]:
        provider = self.provider_name
        config_error = self._configuration_error()
        supported = provider in SUPPORTED_PROVIDERS
        configured = supported and config_error is None
        real_enabled = provider in {"dashscope", "openai_compatible"} and configured
        if provider == "mock" and self.settings.app_env == "production":
            raise LLMProviderError("Mock LLM provider is not allowed in production")
        if provider == "mock":
            message = "当前使用本地 mock 模式，适合稳定演示和离线回归。"
        elif not supported:
            message = f"不支持的 LLM_PROVIDER：{provider}，系统将使用 mock fallback。"
        elif config_error:
            message = f"真实模型配置不完整：{config_error}，系统将使用 mock fallback。"
        else:
            message = f"真实模型已配置：{provider} / {self.model_name}。"
        return {
            "provider": provider,
            "model": self.model_name if provider != "mock" else "mock-local",
            "real_provider_enabled": real_enabled,
            "fallback_enabled": True,
            "configured": configured,
            "stream_supported": self.stream_supported,
            "message": message,
        }

    async def stream_text(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        if not self.stream_supported:
            raise LLMStreamUnsupportedError(f"Provider {self.provider_name} does not support streaming or is not configured")
        iterator = (
            self._stream_dashscope(prompt, system_prompt=system_prompt, temperature=temperature, max_tokens=max_tokens)
            if self.provider_name == "dashscope"
            else self._stream_openai_compatible(prompt, system_prompt=system_prompt, temperature=temperature, max_tokens=max_tokens)
        )
        while True:
            try:
                chunk = await asyncio.to_thread(next, iterator, None)
            except Exception as exc:
                if isinstance(exc, LLMProviderError):
                    raise
                raise LLMProviderError(f"{self.provider_name} stream interrupted: {exc.__class__.__name__}: {exc}") from exc
            if chunk is None:
                break
            if chunk:
                yield chunk

    def _stream_dashscope(self, prompt: str, *, system_prompt: str | None, temperature: float | None, max_tokens: int | None) -> Iterator[str]:
        try:
            import dashscope
            kwargs: dict[str, Any] = {
                "api_key": self.settings.dashscope_api_key,
                "model": self.model_name,
                "prompt": self._compose_prompt(prompt, system_prompt),
                "result_format": "text",
                "temperature": self._temperature(temperature),
                "timeout": int(self.settings.llm_timeout_seconds or 60),
                "stream": True,
                "incremental_output": True,
            }
            if max_tokens is not None:
                kwargs["max_tokens"] = max_tokens
            for response in dashscope.Generation.call(**kwargs):
                if getattr(response, "status_code", None) != 200:
                    raise LLMProviderError(f"DashScope stream returned HTTP {getattr(response, 'status_code', 'unknown')}")
                output = getattr(response, "output", None)
                text = getattr(output, "text", None) if output is not None else None
                if text is None and isinstance(output, dict):
                    text = output.get("text")
                if text:
                    yield str(text)
        except LLMProviderError:
            raise
        except Exception as exc:
            raise LLMProviderError(f"DashScope stream failed: {exc.__class__.__name__}: {exc}") from exc

    def _stream_openai_compatible(self, prompt: str, *, system_prompt: str | None, temperature: float | None, max_tokens: int | None) -> Iterator[str]:
        try:
            client = OpenAI(api_key=self.settings.openai_api_key, base_url=self.settings.llm_base_url,
                            timeout=self.settings.llm_request_timeout_seconds, max_retries=self.settings.llm_max_retries)
            stream = client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                temperature=self._temperature(temperature), max_tokens=max_tokens, stream=True,
            )
            for packet in stream:
                delta = packet.choices[0].delta.content if packet.choices else None
                if delta:
                    yield delta
        except Exception as exc:
            raise LLMProviderError(f"OpenAI-compatible stream failed: {exc.__class__.__name__}: {exc}") from exc

    def generate_text(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        fallback: str | None = None,
    ) -> LLMResult:
        """Deprecated compatibility API. New code must use ModelRouter."""
        provider = self.provider_name
        if provider == "mock" and self.settings.app_env == "production":
            raise LLMProviderError("Mock LLM provider is not allowed in production")
        if provider == "mock":
            return self._fallback_result(prompt, fallback=fallback, error_message=None)
        if provider not in SUPPORTED_PROVIDERS and not self._fallback_allowed():
            raise LLMProviderError(f"Unsupported LLM provider: {provider}")
        if provider not in SUPPORTED_PROVIDERS:
            return self._fallback_result(prompt, fallback=fallback, error_message=f"不支持的 LLM_PROVIDER：{provider}")

        config_error = self._configuration_error()
        if config_error and not self._fallback_allowed():
            raise LLMProviderError(config_error)
        if config_error:
            return self._fallback_result(prompt, fallback=fallback, error_message=config_error)

        started = time.perf_counter()
        last_error: str | None = None
        attempts = max(1, int(self.settings.llm_max_retries or 0) + 1)
        for attempt in range(1, attempts + 1):
            try:
                if provider == "dashscope":
                    result = self._generate_dashscope(
                        prompt,
                        system_prompt=system_prompt,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )
                else:
                    result = self._generate_openai_compatible(
                        prompt,
                        system_prompt=system_prompt,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )
                elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
                logger.info(
                    "LLM call finished provider=%s model=%s success=true fallback=false elapsed_ms=%s",
                    provider,
                    result.model_name,
                    elapsed_ms,
                )
                return result
            except Exception as exc:  # noqa: BLE001 - provider failures must not break product flows.
                last_error = exc.__class__.__name__
                logger.warning(
                    "LLM call failed provider=%s model=%s attempt=%s/%s error=%s",
                    provider,
                    self.model_name,
                    attempt,
                    attempts,
                    last_error,
                )
                if attempt < attempts:
                    time.sleep(min(1.5, 0.3 * attempt))

        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info(
            "LLM call finished provider=%s model=%s success=false fallback=true elapsed_ms=%s",
            provider,
            self.model_name,
            elapsed_ms,
        )
        if not self._fallback_allowed():
            raise LLMProviderError(f"Real model request failed: {last_error or 'unknown'}")
        return self._fallback_result(
            prompt,
            fallback=fallback,
            error_message=f"真实模型调用失败：{last_error or 'unknown'}",
        )

    def generate_json(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        schema_hint: str | None = None,
        temperature: float | None = None,
        fallback: str | None = None,
    ) -> LLMResult:
        json_prompt = (
            f"{prompt}\n\n"
            "请只输出一个合法 JSON 对象，不要使用 Markdown 代码块，不要添加解释性前后缀。"
        )
        if schema_hint:
            json_prompt = f"{json_prompt}\n\nJSON 结构要求：\n{schema_hint}"
        return self.generate_text(
            json_prompt,
            system_prompt=system_prompt or DEFAULT_SYSTEM_PROMPT,
            temperature=temperature,
            fallback=fallback,
        )

    def _configuration_error(self) -> str | None:
        provider = self.provider_name
        if provider == "mock":
            return None
        if provider == "dashscope" and not self.settings.dashscope_api_key:
            return "缺少 DASHSCOPE_API_KEY"
        if provider == "openai_compatible":
            if not self.settings.openai_api_key:
                return "缺少 OPENAI_API_KEY"
            if not self.settings.llm_base_url:
                return "缺少 LLM_BASE_URL"
        if provider not in SUPPORTED_PROVIDERS:
            return f"不支持的 provider：{provider}"
        return None

    def _fallback_result(self, prompt: str, *, fallback: str | None, error_message: str | None) -> LLMResult:
        return LLMResult(
            content=fallback or self._mock_from_prompt(prompt),
            model_name="mock-local",
            token_usage=None,
            provider="mock",
            used_fallback=error_message is not None or self.provider_name != "mock",
            error_message=error_message,
        )

    def _fallback_allowed(self) -> bool:
        return self.settings.app_env == "test" or (
            self.settings.app_env == "development" and self.settings.allow_mock_fallback
        )

    def _generate_dashscope(
        self,
        prompt: str,
        *,
        system_prompt: str | None,
        temperature: float | None,
        max_tokens: int | None,
    ) -> LLMResult:
        import dashscope

        composed_prompt = self._compose_prompt(prompt, system_prompt)
        call_kwargs: dict[str, Any] = {
            "api_key": self.settings.dashscope_api_key,
            "model": self.model_name,
            "prompt": composed_prompt,
            "result_format": "text",
            "temperature": self._temperature(temperature),
            "timeout": int(self.settings.llm_timeout_seconds or 60),
        }
        if max_tokens is not None:
            call_kwargs["max_tokens"] = max_tokens
        response = dashscope.Generation.call(**call_kwargs)
        if getattr(response, "status_code", None) != 200:
            raise RuntimeError("DashScope returned a non-200 response")
        output = getattr(response, "output", None)
        content = getattr(output, "text", None)
        if content is None and isinstance(output, dict):
            content = output.get("text")
        if not content:
            raise RuntimeError("DashScope returned empty output")
        return LLMResult(
            content=str(content).strip(),
            model_name=self.model_name,
            token_usage=self._to_plain_dict(getattr(response, "usage", None)),
            provider="dashscope",
        )

    def _generate_openai_compatible(
        self,
        prompt: str,
        *,
        system_prompt: str | None,
        temperature: float | None,
        max_tokens: int | None,
    ) -> LLMResult:
        client = OpenAI(api_key=self.settings.openai_api_key, base_url=self.settings.llm_base_url,
                        timeout=self.settings.llm_request_timeout_seconds, max_retries=self.settings.llm_max_retries)
        response = client.chat.completions.create(
            model=self.model_name,
            messages=[{"role": "system", "content": system_prompt or DEFAULT_SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
            temperature=self._temperature(temperature), max_tokens=max_tokens,
        )
        content = (response.choices[0].message.content or "").strip() if response.choices else ""
        if not content:
            raise RuntimeError("OpenAI-compatible provider returned empty output")
        return LLMResult(
            content=content,
            model_name=self.model_name,
            token_usage=response.usage.model_dump() if response.usage else None,
            provider="openai_compatible",
        )

    def _chat_completions_url(self) -> str:
        base_url = self.settings.llm_base_url.rstrip("/")
        if base_url.endswith("/chat/completions"):
            return base_url
        return f"{base_url}/chat/completions"

    def _compose_prompt(self, prompt: str, system_prompt: str | None) -> str:
        return f"{system_prompt or DEFAULT_SYSTEM_PROMPT}\n\n{prompt}"

    def _temperature(self, value: float | None) -> float:
        raw = self.settings.llm_temperature if value is None else value
        try:
            return max(0.0, min(2.0, float(raw)))
        except (TypeError, ValueError):
            return 0.3

    def _to_plain_dict(self, value: Any) -> dict[str, Any] | None:
        if value is None:
            return None
        if isinstance(value, dict):
            return value
        try:
            return dict(value)
        except (TypeError, ValueError):
            return None

    def _mock_from_prompt(self, prompt: str) -> str:
        return (
            "# 教学内容生成结果\n\n"
            "## 一、生成说明\n"
            "当前未启用可用的真实大模型服务，系统已使用本地 mock fallback 返回结构化 Markdown 内容。\n\n"
            "## 二、输入摘要\n"
            f"{prompt[:800]}\n\n"
            "## 三、后续建议\n"
            "- 配置真实 LLM Provider 后可获得更细致的生成内容。\n"
            "- 当前结果保持 Markdown 格式，可用于前端展示、回归测试和离线演示。\n"
        )


def get_llm_provider_name() -> str:
    return get_settings().llm_provider


llm_provider = LLMProvider()
