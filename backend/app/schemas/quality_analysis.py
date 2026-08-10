from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

DepthLevel = Literal["basic", "intermediate", "advanced"]
ConfidenceLevel = Literal["low", "medium", "high"]


class CoverageData(BaseModel):
    expected_keywords: list[str] = Field(default_factory=list)
    covered_keywords: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    coverage_rate: float = Field(ge=0, le=1)
    explanation: str


class DepthAnalysis(BaseModel):
    expected_depth: DepthLevel
    actual_depth: DepthLevel
    score: float = Field(ge=0, le=1)
    explanation: str
    suggestions: list[str] = Field(default_factory=list)


class ConfidenceScore(BaseModel):
    level: ConfidenceLevel
    score: float = Field(ge=0, le=1)
    explanation: str
    factors: list[str] = Field(default_factory=list)


class EvidenceSource(BaseModel):
    source_type: str
    file_id: int | None = None
    knowledge_document_id: int | None = None
    chunk_id: str | None = None
    source_hash: str | None = None
    source_version: str | None = None
    retrieval_similarity: float | None = None
    reference_text: str


class KeypointMatch(BaseModel):
    keypoint: str
    evidence_chunk_id: str
    generated_section: str
    similarity: float = Field(ge=0, le=1)


class QualityAnalysis(BaseModel):
    analysis_version: str = "qa-v2"
    evidence_available: bool = False
    evidence_sources: list[EvidenceSource] = Field(default_factory=list)
    evidence_chunk_ids: list[str] = Field(default_factory=list)
    source_keypoints: list[str] = Field(default_factory=list)
    matched_keypoints: list[KeypointMatch] = Field(default_factory=list)
    missing_keypoints: list[str] = Field(default_factory=list)
    source_coverage: float | None = Field(default=None, ge=0, le=1)
    source_match_rate: float | None = Field(default=None, ge=0, le=1)
    diagnostic_confidence: float | None = Field(default=None, ge=0, le=1)
    constraint_fulfillment: float | None = Field(default=None, ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)
    unavailable_reason: str | None = None
    algorithm: dict[str, Any] = Field(default_factory=dict)
    # qa-v1 compatibility. Historical snapshots remain readable without inventing qa-v2 values.
    coverage: CoverageData | None = None
    depth: DepthAnalysis | None = None
    confidence: ConfidenceScore | None = None
    suggestions: list[str] = Field(default_factory=list)
