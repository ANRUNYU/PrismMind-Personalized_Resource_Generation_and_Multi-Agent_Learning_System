from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class EvidenceStatus(StrEnum):
    sufficient = "sufficient"
    insufficient = "evidence_insufficient"
    unavailable = "unavailable"


class GroundingPolicy(StrEnum):
    STRICT = "strict"
    GROUNDED_WITH_DISCLOSURE = "grounded_with_disclosure"
    CONTEXTUAL = "contextual"


class RetrievalRequest(BaseModel):
    agent_role: str
    query: str = Field(min_length=1, max_length=4000)
    course_id: int | None = None
    document_ids: list[int] | None = None
    top_k: int = Field(default=5, ge=1, le=50)
    policy: GroundingPolicy = GroundingPolicy.STRICT
    allow_general_knowledge: bool = False


class EvidenceChunk(BaseModel):
    citation_id: str
    content: str
    similarity: float
    rerank_score: float | None = None
    document_id: int
    file_id: int | None = None
    source_filename: str
    page_number: int | None = None
    slide_number: int | None = None
    sheet_name: str | None = None
    heading_path: list[str] = Field(default_factory=list)
    chunk_index: int


class EvidenceSource(BaseModel):
    citation_id: str
    document_id: int
    file_id: int | None = None
    source_filename: str
    page_number: int | None = None
    slide_number: int | None = None
    sheet_name: str | None = None
    heading_path: list[str] = Field(default_factory=list)
    similarity: float | None = None
    excerpt: str | None = None


class EvidencePack(BaseModel):
    query: str
    status: EvidenceStatus
    policy: GroundingPolicy
    chunks: list[EvidenceChunk] = Field(default_factory=list)
    sources: list[EvidenceSource] = Field(default_factory=list)
    candidate_count: int = 0
    accepted_count: int = 0
    top_similarity: float | None = None
    mean_similarity: float | None = None
    retrieval_model: str
    rerank_model: str | None = None
    warnings: list[str] = Field(default_factory=list)
    insufficient_reason: str | None = None
    calibrated: bool = False
    retrieval_latency_ms: float = 0
    embedding_latency_ms: float = 0
    rerank_latency_ms: float = 0
    similarity_distribution: list[float] = Field(default_factory=list)

    @property
    def may_generate(self) -> bool:
        return self.policy == GroundingPolicy.CONTEXTUAL or self.status == EvidenceStatus.sufficient


class CitationValidationResult(BaseModel):
    content: str
    citations: list[EvidenceSource]
    evidence_status: EvidenceStatus
    warnings: list[str] = Field(default_factory=list)
