from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.core.config import Settings, get_settings


class AgentRole(StrEnum):
    ORCHESTRATOR = "orchestrator"
    PROFILE = "profile"
    TUTOR = "tutor"
    RESOURCE = "resource"
    TEST = "test"
    PATH = "path"
    ASSESSMENT = "assessment"
    VERIFIER = "verifier"
    orchestrator = ORCHESTRATOR
    profile = PROFILE
    tutor = TUTOR
    resource = RESOURCE
    test = TEST
    path = PATH
    assessment = ASSESSMENT
    verifier = VERIFIER


@dataclass(frozen=True)
class ModelCapabilities:
    supports_stream: bool = True
    supports_tools: bool = True
    supports_parallel_tools: bool = False
    supports_json_object: bool = True
    supports_thinking: bool = False
    supports_embeddings: bool = False
    supports_rerank: bool = False


@dataclass(frozen=True)
class ModelRegistration:
    role: AgentRole
    model_id: str
    provider: str
    capabilities: ModelCapabilities
    fallback_model_id: str | None = None


class ModelRegistry:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._registrations = self._build_registrations()

    def _build_registrations(self) -> dict[AgentRole, ModelRegistration]:
        qwen = ModelCapabilities(supports_stream=True, supports_tools=True, supports_parallel_tools=True, supports_json_object=True)
        deepseek = ModelCapabilities(supports_stream=True, supports_tools=False, supports_json_object=True, supports_thinking=False)
        models = {
            AgentRole.orchestrator: self.settings.agent_model_orchestrator,
            AgentRole.profile: self.settings.agent_model_profile,
            AgentRole.tutor: self.settings.agent_model_tutor,
            AgentRole.resource: self.settings.agent_model_resource,
            AgentRole.test: self.settings.agent_model_test,
            AgentRole.path: self.settings.agent_model_path,
            AgentRole.assessment: self.settings.agent_model_assessment,
            AgentRole.verifier: self.settings.agent_model_verifier,
        }
        return {
            role: ModelRegistration(
                role=role, model_id=model_id, provider="dashscope",
                capabilities=deepseek if model_id.startswith("deepseek") else qwen,
                fallback_model_id=(
                    self.settings.agent_fallback_model_profile if role == AgentRole.profile
                    else self.settings.agent_fallback_model_test if role == AgentRole.test
                    else self.settings.agent_fallback_model_path if role == AgentRole.path
                    else None
                ),
            )
            for role, model_id in models.items()
        }

    def get(self, role: AgentRole | str) -> ModelRegistration:
        try:
            normalized = role if isinstance(role, AgentRole) else AgentRole(role)
        except ValueError as exc:
            raise KeyError(f"Unknown agent role: {role}") from exc
        return self._registrations[normalized]

    def all(self) -> list[ModelRegistration]:
        return list(self._registrations.values())

    def status(self) -> list[dict[str, Any]]:
        configured = bool(self.settings.dashscope_api_key)
        return [{
            "role": item.role.value,
            "configured_model": item.model_id,
            "configured": configured,
            "last_probe_status": None,
            "last_probe_at": None,
            "provider": item.provider,
        } for item in self.all()]


model_registry = ModelRegistry()
