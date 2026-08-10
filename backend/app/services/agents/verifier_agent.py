from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.services.knowledge.models import EvidencePack
from app.services.llm.base import ChatMessage
from app.services.llm.model_registry import AgentRole
from app.services.llm.router import ModelRouter, router


class VerificationReport(BaseModel):
    supported_claims: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    citation_errors: list[str] = Field(default_factory=list)
    grounding_score: float = Field(ge=0, le=1)
    decision: Literal["pass", "pass_with_warning", "reject"]
    warnings: list[str] = Field(default_factory=list)


class GroundingVerifierAgent:
    role = AgentRole.VERIFIER

    def __init__(self, *, model_router: ModelRouter | None = None) -> None:
        self.router = model_router or router

    async def verify(self, *, role: AgentRole, content: str, structured_output: Any,
                     evidence: EvidencePack, strict: bool) -> VerificationReport:
        allowed = {chunk.citation_id for chunk in evidence.chunks}
        cited = set(re.findall(r"\[(S\d+)\]", content))
        errors = [f"unknown citation {item}" for item in sorted(cited - allowed)]
        filenames = {source.source_filename for source in evidence.sources if source.source_filename}
        mentioned_files = set(re.findall(r"[\w.-]+\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|md)", content, re.I))
        errors.extend(f"unknown filename {item}" for item in sorted(mentioned_files - filenames))
        if role == AgentRole.TEST:
            questions = getattr(structured_output, "questions", [])
            for index, question in enumerate(questions, 1):
                if not str(getattr(question, "stem", "")).strip() or getattr(question, "answer", None) in (None, ""):
                    errors.append(f"question {index} has empty stem or answer")
                invalid = set(getattr(question, "source_citation_ids", [])) - allowed
                errors.extend(f"question {index} unknown citation {item}" for item in sorted(invalid))
        if role == AgentRole.RESOURCE:
            for index, chapter in enumerate(getattr(structured_output, "chapters", []), 1):
                invalid = set(getattr(chapter, "source_ids", [])) - allowed
                if not getattr(chapter, "source_ids", []):
                    errors.append(f"chapter {index} has no source_ids")
                errors.extend(f"chapter {index} unknown citation {item}" for item in sorted(invalid))
        if role == AgentRole.PATH:
            steps = getattr(structured_output, "steps", [])
            for index, step in enumerate(steps, 1):
                invalid = set(getattr(step, "source_ids", [])) - allowed
                if not getattr(step, "source_ids", []):
                    errors.append(f"path step {index} has no source_ids")
                errors.extend(f"path step {index} unknown citation {item}" for item in sorted(invalid))
            planned_points = {str(getattr(step, "knowledge_point", "")).strip() for step in steps}
            final_points = {str(item).strip() for item in getattr(structured_output, "final_assessment_knowledge_points", [])}
            missing_final = sorted(point for point in planned_points - final_points if point)
            if missing_final:
                errors.append(f"final assessment misses path knowledge points: {missing_final}")
        if role == AgentRole.TUTOR and content.strip() and not cited:
            errors.append("tutor answer has no citations")
        unsupported_numbers = []
        if re.search(r"\b\d+(?:\.\d+)?%", content) and not cited:
            unsupported_numbers.append("numeric conclusion has no citation")
        errors.extend(unsupported_numbers)
        if errors:
            return VerificationReport(
                unsupported_claims=unsupported_numbers, citation_errors=errors, grounding_score=0,
                decision="reject" if strict else "pass_with_warning", warnings=errors,
            )
        prompt = (
            "Verify grounding using only citation IDs and supplied evidence. Return JSON.\n"
            f"role={role.value}\nallowed={sorted(allowed)}\ncontent={content}\n"
            f"evidence={[{'citation_id': c.citation_id, 'content': c.content} for c in evidence.chunks]}"
        )
        try:
            response = await self.router.structured_chat(
                role=AgentRole.VERIFIER, messages=[ChatMessage(role="user", content=prompt)], schema=VerificationReport,
            )
            return response.parsed if isinstance(response.parsed, VerificationReport) else VerificationReport.model_validate(response.parsed)
        except Exception as exc:
            return VerificationReport(
                grounding_score=0.5, decision="pass_with_warning",
                warnings=[f"Verifier model unavailable ({type(exc).__name__}); deterministic checks passed"],
            )
