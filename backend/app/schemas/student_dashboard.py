from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class DashboardProfileSummary(BaseModel):
    exists: bool
    summary: str | None = None
    scores: dict[str, float] = Field(default_factory=dict)


class DashboardCollectionSummary(BaseModel):
    total: int = 0
    recent: list[dict[str, Any]] = Field(default_factory=list)


class DashboardCoursesSummary(DashboardCollectionSummary):
    active: int = 0


class DashboardResourcesSummary(DashboardCollectionSummary):
    completed: int = 0


class DashboardLearningPathsSummary(DashboardCollectionSummary):
    in_progress: int = 0
    average_completion: float = 0.0


class DashboardAssessmentsSummary(BaseModel):
    total: int = 0
    average_score: float = 0.0
    recent_score: float | None = None
    weak_topics: list[str] = Field(default_factory=list)
    recommendations: list[dict[str, Any]] = Field(default_factory=list)


class DashboardTutoringSummary(BaseModel):
    sessions: int = 0
    recent: list[dict[str, Any]] = Field(default_factory=list)


class DashboardTasksSummary(BaseModel):
    pending: int = 0
    running: int = 0
    completed: int = 0


class DashboardLLMSummary(BaseModel):
    provider: str
    model: str
    real_provider_enabled: bool


class StudentDashboardSummary(BaseModel):
    profile: DashboardProfileSummary
    courses: DashboardCoursesSummary
    resources: DashboardResourcesSummary
    learning_paths: DashboardLearningPathsSummary
    assessments: DashboardAssessmentsSummary
    tutoring: DashboardTutoringSummary
    tasks: DashboardTasksSummary
    llm: DashboardLLMSummary
    updated_at: datetime
