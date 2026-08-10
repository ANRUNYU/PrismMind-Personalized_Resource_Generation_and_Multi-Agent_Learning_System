import asyncio
from types import SimpleNamespace

import pytest

from app.models.enums import AgentRunStatus
from app.services.agents.base import AgentContext, AgentRequest, AgentResult
from app.services.agents.orchestrator import OrchestratorService
from app.services.knowledge.models import EvidenceStatus
from app.services.llm.model_registry import AgentRole


class FakeDB:
    def __init__(self): self.items = []
    def add(self, item):
        item.id = len(self.items) + 1
        self.items.append(item)
    def commit(self): pass
    def refresh(self, _item): pass


class FakeAgent:
    def __init__(self, role): self.role = role
    async def run(self, _context, _request):
        return AgentResult(
            agent_role=self.role, run_id=f"run-{self.role.value}", content=self.role.value,
            evidence_status=EvidenceStatus.sufficient, evidence_pack_id="pack", model_name=f"model-{self.role.value}",
            provider="fake", latency_ms=4, verification={"decision": "pass"},
        )


def test_orchestrator_classifies_single_and_composite_requests():
    service = OrchestratorService()
    assert service.classify("解释二叉树") == [AgentRole.TUTOR]
    assert service.classify("生成二叉树练习") == [AgentRole.TEST]
    assert service.classify("根据我的画像制定学习路径并生成练习") == [AgentRole.PATH, AgentRole.TEST]


def test_composite_request_persists_parent_and_two_child_runs():
    db = FakeDB()
    service = OrchestratorService()
    service.agents = {AgentRole.PATH: FakeAgent(AgentRole.PATH), AgentRole.TEST: FakeAgent(AgentRole.TEST)}
    user = SimpleNamespace(id=9)
    result = asyncio.run(service.execute(
        db, AgentContext.model_construct(db=db, user=user, course_id=None, document_ids=None,
                                         profile_snapshot={}, learning_history=[], assessment_history=[], conversation_history=[]),
        AgentRequest(query="制定学习路径并生成练习"),
    ))
    assert len(db.items) == 3
    parent, path_run, test_run = db.items
    assert parent.agent_type == AgentRole.ORCHESTRATOR.value
    assert parent.status == AgentRunStatus.success
    assert path_run.parent_run_id == parent.id
    assert test_run.parent_run_id == parent.id
    assert path_run.model_name == "model-path"
    assert test_run.model_name == "model-test"
    assert result["orchestrator_run_id"] == parent.run_uuid
