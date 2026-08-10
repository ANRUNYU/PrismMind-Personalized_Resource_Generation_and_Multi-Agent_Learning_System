from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.quality_analysis import QualityAnalysis


AssessmentType = Literal["resource", "path", "topic", "test", "comprehensive"]
RecommendationPriority = Literal["high", "medium", "low"]


class AssessmentRecommendation(BaseModel):
    title: str
    description: str
    priority: RecommendationPriority = "medium"
    reason: str | None = None
    suggested_action: str
    related_topics: list[str] = Field(default_factory=list)


class LearningAssessmentCreate(BaseModel):
    assessment_type: AssessmentType = Field(description="Assessment scope")
    topic: str | None = Field(default=None, max_length=160)
    resource_id: int | None = Field(default=None, gt=0)
    path_id: int | None = Field(default=None, gt=0)
    test_id: int | None = Field(default=None, gt=0)
    score: float | None = Field(default=None, ge=0, le=100)
    correct_topics: list[str] = Field(default_factory=list)
    incorrect_topics: list[str] = Field(default_factory=list)
    learning_evidence: dict[str, Any] = Field(default_factory=dict)


class LearningAssessmentSubmit(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)
    reflection: str | None = Field(default=None, max_length=4000)
    self_rating: float | None = Field(default=None, ge=0, le=100)
    feedback: str | None = Field(default=None, max_length=4000)


class LearningAssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assessment_id: int | None = None
    title: str | None = None
    assessment_type: str
    target_type: str | None = None
    target_id: int | None = None
    topic: str | None = None
    resource_id: int | None = None
    path_id: int | None = None
    test_id: int | None = None
    score: float | None = None
    level: str | None = None
    summary: str | None = None
    strengths: list[Any] = Field(default_factory=list)
    weaknesses: list[Any] = Field(default_factory=list)
    weak_topics: list[Any] = Field(default_factory=list)
    correct_topics: list[Any] = Field(default_factory=list)
    incorrect_topics: list[Any] = Field(default_factory=list)
    analysis: str | None = None
    recommendations: list[AssessmentRecommendation] = Field(default_factory=list)
    answers: dict[str, Any] = Field(default_factory=dict)
    reflection: str | None = None
    self_rating: float | None = None
    feedback: str | None = None
    quality_analysis: QualityAnalysis | None = None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None = None


class LearningAssessmentListResponse(BaseModel):
    items: list[LearningAssessmentRead]
    total: int
    page: int
    page_size: int


class AssessmentTrendPoint(BaseModel):
    assessment_id: int
    score: float | None = None
    created_at: datetime


class LearningAssessmentSummary(BaseModel):
    total_assessments: int
    average_score: float
    latest_score: float | None = None
    score_trend: list[AssessmentTrendPoint] = Field(default_factory=list)
    strong_topics: list[str] = Field(default_factory=list)
    weak_topics: list[str] = Field(default_factory=list)
    assessment_type_distribution: dict[str, int] = Field(default_factory=dict)
    recent_recommendations: list[AssessmentRecommendation] = Field(default_factory=list)
    profile_dimension_hints: dict[str, float] = Field(default_factory=dict)


class LearningRecommendationResponse(BaseModel):
    recommendations: list[AssessmentRecommendation]
    basis: dict[str, Any]
