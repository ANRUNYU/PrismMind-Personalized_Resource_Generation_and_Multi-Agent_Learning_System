import asyncio
import os

import pytest

from app.services.llm.base import ChatMessage
from app.services.llm.model_registry import AgentRole, model_registry
from app.services.llm.router import router


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_LIVE_LLM_TESTS") != "1",
    reason="Set RUN_LIVE_LLM_TESTS=1 to run explicitly billed model access smoke tests",
)


def test_each_configured_agent_model_accepts_a_minimal_request():
    asyncio.run(_probe_models())


async def _probe_models():
    seen_models: set[str] = set()
    for role in AgentRole:
        registration = model_registry.get(role)
        if registration.model_id in seen_models:
            continue
        seen_models.add(registration.model_id)
        response = await router.chat(
            role=role,
            messages=[ChatMessage(role="user", content="Reply with OK only.")],
            max_tokens=3,
            temperature=0,
        )
        assert response.content
        assert response.model


def test_composite_orchestrator_route_is_bounded_to_one_request_shape():
    from app.services.agents.orchestrator import OrchestratorService
    assert OrchestratorService().classify("制定计划并生成练习") == [AgentRole.PATH, AgentRole.TEST]
