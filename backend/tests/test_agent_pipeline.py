from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy.orm import Session

from app.models.enums import UserRole
from app.models.user import User
from app.services.agents.assessment_agent import AssessmentAgent
from app.services.agents.base import AgentContext, AgentError, AgentRequest
from app.services.agents.path_agent import PathPlanningAgent
from app.services.agents.profile_agent import ProfileAgent
from app.services.agents.resource_agent import ResourceAgent
from app.services.agents.test_agent import TestAgent
from app.services.agents.tutor_agent import TutorAgent
from app.services.agents.verifier_agent import VerificationReport
from app.services.knowledge.models import EvidenceChunk, EvidencePack, EvidenceSource, EvidenceStatus, GroundingPolicy
from app.services.llm.base import LLMResponse, LLMUsage
from app.services.llm.model_registry import AgentRole


def actor(identifier=1):
    return User(id=identifier, username=f"u{identifier}", email=f"u{identifier}@x.com", password_hash="x", role=UserRole.student)


def evidence(status=EvidenceStatus.sufficient):
    chunk = EvidenceChunk(citation_id="S1", content="course fact", similarity=.9, document_id=1, file_id=2,
                          source_filename="lesson.pdf", page_number=4, chunk_index=0)
    source = EvidenceSource(citation_id="S1", document_id=1, file_id=2, source_filename="lesson.pdf", page_number=4)
    return EvidencePack(query="q", status=status, policy=GroundingPolicy.STRICT,
                        chunks=[chunk] if status == EvidenceStatus.sufficient else [],
                        sources=[source] if status == EvidenceStatus.sufficient else [], candidate_count=1,
                        accepted_count=1 if status == EvidenceStatus.sufficient else 0, top_similarity=.9,
                        mean_similarity=.9, retrieval_model="text-embedding-v4")


SAMPLES = {
    AgentRole.PROFILE: {"extracted_fields": {"major": "CS"}, "missing_fields": [], "summary": "profile"},
    AgentRole.TUTOR: {"content": "course fact [S1]", "citation_ids": ["S1"]},
    AgentRole.RESOURCE: {"title": "r", "resource_type": "notes", "chapters": [{"title": "c", "content": "fact", "source_ids": ["S1"]}]},
    AgentRole.TEST: {"title": "t", "questions": [{"question_type": "short_answer", "stem": "q", "answer": "a", "explanation": "e", "source_citation_ids": ["S1"]}]},
    AgentRole.PATH: {"title": "p", "steps": [{"title": "s", "knowledge_point": "k", "learning_objectives": ["o"], "estimated_minutes": 30, "source_ids": ["S1"]}], "final_assessment_knowledge_points": ["k"]},
    AgentRole.ASSESSMENT: {"summary": "score remains 80 [S1]", "recommendations": ["review"], "weak_point_evidence": {"k": ["test:1"]}, "citation_ids": ["S1"]},
}


class FakeRouter:
    def __init__(self, *, fail=False): self.roles=[]; self.fail=fail
    async def structured_chat(self, *, role, schema, **kwargs):
        self.roles.append(AgentRole(role))
        if self.fail: raise RuntimeError("model offline")
        parsed = schema.model_validate(SAMPLES[AgentRole(role)])
        return LLMResponse(content=parsed.model_dump_json(), model=f"actual-{AgentRole(role).value}", provider="fake",
                           parsed=parsed, usage=LLMUsage(prompt_tokens=2, completion_tokens=3, total_tokens=5))


class FakeVerifier:
    def __init__(self, decision="pass"): self.decision=decision
    async def verify(self, **kwargs):
        return VerificationReport(grounding_score=1 if self.decision == "pass" else 0, decision=self.decision)


class KnowledgeFactory:
    def __init__(self, pack): self.pack=pack; self.calls=[]
    def __call__(self, db): return self
    def retrieve_for_agent(self, *args, **kwargs): self.calls.append((args, kwargs)); return self.pack


AGENTS = [ProfileAgent, TutorAgent, ResourceAgent, TestAgent, PathPlanningAgent, AssessmentAgent]


@pytest.mark.parametrize("agent_type", AGENTS)
def test_each_agent_routes_model_calls_knowledge_and_records_actual_model(agent_type):
    router = FakeRouter(); knowledge = KnowledgeFactory(evidence())
    agent = agent_type(model_router=router, knowledge_service_factory=knowledge, verifier=FakeVerifier())
    result = __import__("asyncio").run(agent.run(
        AgentContext(db=Session(), user=actor(), course_id=5, conversation_history=[{"role": "user", "content": "history fact"}]),
        AgentRequest(query="question", payload={"course_name": "Course"}),
    ))
    assert router.roles == [agent.role]
    assert knowledge.calls and knowledge.calls[0][0][1].id == 1
    assert result.model_name == f"actual-{agent.role.value}"
    assert result.usage.total_tokens == 5
    if agent.role != AgentRole.PROFILE:
        assert result.citations and result.citations[0].page_number == 4


@pytest.mark.parametrize("agent_type", [TutorAgent, ResourceAgent, TestAgent, PathPlanningAgent])
def test_strict_agents_do_not_call_model_without_evidence(agent_type):
    router = FakeRouter(); knowledge = KnowledgeFactory(evidence(EvidenceStatus.insufficient))
    agent = agent_type(model_router=router, knowledge_service_factory=knowledge, verifier=FakeVerifier())
    result = __import__("asyncio").run(agent.run(AgentContext(db=Session(), user=actor(), course_id=5), AgentRequest(query="q")))
    assert result.evidence_status == EvidenceStatus.insufficient
    assert router.roles == []


def test_verifier_reject_blocks_strict_result():
    agent = TutorAgent(model_router=FakeRouter(), knowledge_service_factory=KnowledgeFactory(evidence()), verifier=FakeVerifier("reject"))
    with pytest.raises(AgentError, match="rejected"):
        __import__("asyncio").run(agent.run(AgentContext(db=Session(), user=actor(), course_id=5), AgentRequest(query="q")))


def test_model_failure_is_not_reported_as_success():
    agent = TestAgent(model_router=FakeRouter(fail=True), knowledge_service_factory=KnowledgeFactory(evidence()), verifier=FakeVerifier())
    with pytest.raises(AgentError) as exc:
        __import__("asyncio").run(agent.run(AgentContext(db=Session(), user=actor(), course_id=5), AgentRequest(query="q")))
    assert exc.value.code == "model_failed"


def test_assessment_recommendations_survive_optional_model_failure(monkeypatch):
    agent = AssessmentAgent()

    def fail_enhancement(*_args, **_kwargs):
        raise RuntimeError("model offline")

    monkeypatch.setattr(agent, "_legacy_generate_json", fail_enhancement)
    recommendations = agent.build_recommendations(score=45, incorrect_topics=["python"])

    assert recommendations
    assert recommendations[0]["related_topics"] == ["python"]
    assert recommendations[0]["suggested_action"]


def test_assessment_recommendations_are_empty_without_assessment_data(monkeypatch):
    agent = AssessmentAgent()

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("recommendations must not be generated without assessment data")

    monkeypatch.setattr(agent, "build_recommendations", fail_if_called)
    result = agent.recommend(
        assessments=[],
        profile=SimpleNamespace(exam_score=10, practice_score=10, efficiency_score=10),
        top_k=5,
    )

    assert result["recommendations"] == []
    assert result["basis"] == {
        "profile_used": False,
        "assessment_count": 0,
        "latest_assessment_id": None,
    }
