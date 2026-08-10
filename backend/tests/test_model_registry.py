from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from app.core.config import Settings
from app.services.llm.model_registry import AgentRole, ModelRegistry


def test_settings_read_role_models_and_limits(monkeypatch):
    monkeypatch.setenv("AGENT_MODEL_TEST", "deepseek-v3-custom")
    monkeypatch.setenv("LLM_MAX_CONCURRENCY", "7")
    settings = Settings(_env_file=None)
    assert settings.agent_model_test == "deepseek-v3-custom"
    assert settings.llm_max_concurrency == 7
    assert settings.embedding_dimension == 1024


def test_model_registry_routes_roles_and_rejects_unknown():
    registry = ModelRegistry(Settings(_env_file=None))
    assert registry.get(AgentRole.orchestrator).model_id == "qwen3.7-plus"
    assert registry.get("test").model_id == "deepseek-v3"
    assert registry.get("test").capabilities.supports_stream is True
    assert registry.get(AgentRole.path).fallback_model_id == "qwen3-max"
    assert registry.get(AgentRole.test).fallback_model_id == "qwen3-max"
    with pytest.raises(KeyError, match="Unknown agent role"):
        registry.get("missing-role")


def test_probe_without_key_never_opens_network(monkeypatch):
    script = Path(__file__).resolve().parents[2] / "scripts" / "probe_model_access.py"
    spec = importlib.util.spec_from_file_location("probe_model_access", script)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
    monkeypatch.setattr(module.urllib.request, "urlopen", lambda *_args, **_kwargs: pytest.fail("network request attempted"))
    results = module.probe(Settings(_env_file=None))
    assert results and all(item["error_type"] == "missing_api_key" for item in results)
    assert "secret-test-value" not in str(results)
