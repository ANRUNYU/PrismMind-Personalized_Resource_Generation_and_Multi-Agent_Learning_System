from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from abc import ABC
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.user import User
from app.services.knowledge.citations import format_grounded_context, validate_citations
from app.services.knowledge.models import EvidencePack, EvidenceSource, EvidenceStatus, GroundingPolicy
from app.services.knowledge.query_builder import QueryBuilder
from app.services.knowledge.service import KnowledgeService
from app.services.llm.base import ChatMessage, LLMResponse
from app.services.llm.model_registry import AgentRole
from app.services.llm.router import ModelRouter, router


class AgentError(RuntimeError):
    def __init__(self, message: str, *, code: str = "agent_failed") -> None:
        super().__init__(message)
        self.code = code


class AgentContext(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    db: Session
    user: User
    course_id: int | None = None
    document_ids: list[int] | None = None
    profile_snapshot: dict[str, Any] = Field(default_factory=dict)
    learning_history: list[dict[str, Any]] = Field(default_factory=list)
    assessment_history: list[dict[str, Any]] = Field(default_factory=list)
    conversation_history: list[dict[str, str]] = Field(default_factory=list)


class AgentRequest(BaseModel):
    query: str
    payload: dict[str, Any] = Field(default_factory=dict)
    allow_general_knowledge: bool = False
    top_k: int = 5


class AgentUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class AgentResult(BaseModel):
    agent_role: AgentRole
    run_id: str
    content: str
    structured_output: Any = None
    citations: list[EvidenceSource] = Field(default_factory=list)
    evidence_status: EvidenceStatus
    evidence_pack_id: str
    model_name: str | None = None
    provider: str | None = None
    usage: AgentUsage = Field(default_factory=AgentUsage)
    warnings: list[str] = Field(default_factory=list)
    verification: dict[str, Any] = Field(default_factory=dict)
    latency_ms: float
    used_fallback: bool = False
    general_knowledge_used: bool = False
    profile_snapshot: dict[str, Any] = Field(default_factory=dict)
    evidence_snapshot: dict[str, Any] = Field(default_factory=dict)


class ProfileExtraction(BaseModel):
    extracted_fields: dict[str, Any] = Field(default_factory=dict)
    missing_fields: list[str] = Field(default_factory=list)
    next_question: str | None = None
    summary: str = ""
    source: str = "model"


class TutorOutput(BaseModel):
    content: str
    citation_ids: list[str] = Field(default_factory=list)


class ResourceChapter(BaseModel):
    title: str
    content: str
    source_ids: list[str] = Field(default_factory=list)


class ResourceGeneration(BaseModel):
    title: str
    resource_type: str
    chapters: list[ResourceChapter]
    general_knowledge_supplement: str | None = None


class GeneratedQuestion(BaseModel):
    question_type: str
    stem: str
    answer: Any
    explanation: str
    source_citation_ids: list[str] = Field(default_factory=list)


class TestGeneration(BaseModel):
    title: str
    questions: list[GeneratedQuestion]
    reduced_question_count_reason: str | None = None


class LearningPathStepPlan(BaseModel):
    title: str
    knowledge_point: str
    learning_objectives: list[str]
    estimated_minutes: int = Field(gt=0)
    source_ids: list[str] = Field(default_factory=list)
    description: str = ""
    learning_content: str = ""
    example: str = ""
    practice_task: str = ""
    completion_criteria: str = ""


class LearningPathPlan(BaseModel):
    title: str
    steps: list[LearningPathStepPlan]
    final_assessment_knowledge_points: list[str]


class AssessmentExplanation(BaseModel):
    summary: str
    recommendations: list[str]
    weak_point_evidence: dict[str, list[str]] = Field(default_factory=dict)
    citation_ids: list[str] = Field(default_factory=list)


OutputT = TypeVar("OutputT", bound=BaseModel)


class BaseAgent(ABC, Generic[OutputT]):
    role: AgentRole
    policy: GroundingPolicy = GroundingPolicy.STRICT
    output_schema: type[OutputT]
    system_prompt: str = "Return valid JSON grounded only in the supplied evidence."

    def __init__(self, *, model_router: ModelRouter | None = None, knowledge_service_factory=KnowledgeService,
                 verifier: Any | None = None) -> None:
        self.router = model_router or router
        self.knowledge_service_factory = knowledge_service_factory
        if verifier is None:
            from app.services.agents.verifier_agent import GroundingVerifierAgent
            verifier = GroundingVerifierAgent(model_router=self.router)
        self.verifier = verifier

    async def run(self, context: AgentContext, request: AgentRequest) -> AgentResult:
        started = time.perf_counter()
        run_id = str(uuid.uuid4())
        query_context = dict(request.payload)
        course_name = str(query_context.pop("course_name", "") or "")
        query = QueryBuilder.build(
            self.role.value, user_input=request.query,
            course_name=course_name, **query_context,
        )
        policy = self.resolve_policy(request)
        knowledge = self.knowledge_service_factory(context.db)
        evidence = knowledge.retrieve_for_agent(
            self.role.value, context.user, context.course_id, query,
            document_ids=context.document_ids, top_k=request.top_k, policy=policy,
        )
        pack_id = hashlib.sha256(evidence.model_dump_json().encode()).hexdigest()[:24]
        if policy == GroundingPolicy.STRICT and evidence.status != EvidenceStatus.sufficient:
            return AgentResult(
                agent_role=self.role, run_id=run_id,
                content=f"知识库证据不足，无法可靠完成本次请求。{evidence.insufficient_reason or ''}",
                evidence_status=evidence.status, evidence_pack_id=pack_id,
                warnings=evidence.warnings, latency_ms=round((time.perf_counter() - started) * 1000, 2),
                verification={"decision": "reject", "reason": "evidence_insufficient"},
            )
        messages = self.build_messages(context=context, request=request, evidence=evidence)
        try:
            response = await self.router.structured_chat(role=self.role, messages=messages, schema=self.output_schema)
        except Exception as exc:
            raise AgentError(f"{self.role.value} model request failed: {type(exc).__name__}", code="model_failed") from exc
        structured = response.parsed
        if not isinstance(structured, self.output_schema):
            structured = self.output_schema.model_validate(structured)
        content = self.render_content(structured)
        citation_result = validate_citations(content, evidence)
        structured_ids = self._collect_citation_ids(structured.model_dump())
        source_map = {source.citation_id: source for source in evidence.sources}
        merged_citations = list(citation_result.citations)
        for citation_id in structured_ids:
            if citation_id in source_map and source_map[citation_id] not in merged_citations:
                merged_citations.append(source_map[citation_id])
        verification = await self.verifier.verify(
            role=self.role, content=citation_result.content, structured_output=structured,
            evidence=evidence, strict=policy == GroundingPolicy.STRICT,
        )
        if policy == GroundingPolicy.STRICT and verification.decision == "reject":
            raise AgentError("Grounding verifier rejected the generated result", code="grounding_rejected")
        usage = response.usage
        warnings = list(dict.fromkeys([*evidence.warnings, *citation_result.warnings, *verification.warnings]))
        return AgentResult(
            agent_role=self.role, run_id=run_id, content=citation_result.content,
            structured_output=structured.model_dump(), citations=merged_citations,
            evidence_status=evidence.status, evidence_pack_id=pack_id,
            model_name=response.model, provider=response.provider,
            usage=AgentUsage(
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
                total_tokens=usage.total_tokens if usage else 0,
            ), warnings=warnings, verification=verification.model_dump(),
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
            used_fallback=response.used_fallback,
            general_knowledge_used=policy == GroundingPolicy.GROUNDED_WITH_DISCLOSURE and request.allow_general_knowledge,
            profile_snapshot=context.profile_snapshot,
            evidence_snapshot=evidence.model_dump(),
        )

    def resolve_policy(self, request: AgentRequest) -> GroundingPolicy:
        if self.role in {AgentRole.TUTOR, AgentRole.RESOURCE} and request.allow_general_knowledge:
            return GroundingPolicy.GROUNDED_WITH_DISCLOSURE
        return self.policy

    def build_messages(self, *, context: AgentContext, request: AgentRequest, evidence: EvidencePack) -> list[ChatMessage]:
        payload = {
            "request": request.payload,
            "query": request.query,
            "profile_snapshot": context.profile_snapshot,
            "learning_history": context.learning_history,
            "assessment_history": context.assessment_history,
            "conversation_history": context.conversation_history[-12:],
            "evidence": format_grounded_context(evidence),
            "allowed_citation_ids": [chunk.citation_id for chunk in evidence.chunks],
        }
        return [ChatMessage(role="system", content=self.system_prompt), ChatMessage(role="user", content=json.dumps(payload, ensure_ascii=False))]

    def render_content(self, output: OutputT) -> str:
        if hasattr(output, "content"):
            return str(getattr(output, "content"))
        if hasattr(output, "summary"):
            return str(getattr(output, "summary"))
        return output.model_dump_json()

    def legacy_text(self, prompt: str) -> LLMResponse:
        return self._sync(self.router.chat(role=self.role, messages=[ChatMessage(role="user", content=prompt)]))

    def legacy_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        **request_options: Any,
    ) -> LLMResponse:
        return self._sync(
            self.router.structured_chat(
                role=self.role,
                messages=[ChatMessage(role="user", content=prompt)],
                schema=schema,
                **request_options,
            )
        )

    @staticmethod
    def _sync(coroutine):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(coroutine)
        raise AgentError("Synchronous Agent compatibility API cannot run inside an active event loop")

    @classmethod
    def _collect_citation_ids(cls, value: Any) -> list[str]:
        found: list[str] = []
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"citation_ids", "source_ids", "source_citation_ids"} and isinstance(item, list):
                    found.extend(str(citation) for citation in item)
                else:
                    found.extend(cls._collect_citation_ids(item))
        elif isinstance(value, list):
            for item in value:
                found.extend(cls._collect_citation_ids(item))
        return list(dict.fromkeys(found))
