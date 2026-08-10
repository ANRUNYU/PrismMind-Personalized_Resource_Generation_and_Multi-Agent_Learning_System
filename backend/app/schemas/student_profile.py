from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ScoreField = Field(ge=0, le=100, description="Score between 0 and 100")


class StudentProfileBase(BaseModel):
    major: str | None = Field(default=None, max_length=120)
    grade: str | None = Field(default=None, max_length=60)
    learning_goal: str | None = Field(default=None, max_length=3000)
    current_level: str | None = Field(default=None, max_length=3000)
    preferred_style: str | None = Field(default=None, max_length=1000)
    available_time_per_week: float | None = Field(default=None, ge=0, le=168)
    exam_pressure: str | None = Field(default=None, max_length=200)
    practice_experience: str | None = Field(default=None, max_length=3000)
    weaknesses: list[str] | None = None
    interests: list[str] | None = None


class StudentProfileCreate(StudentProfileBase):
    pass


class StudentProfileUpdate(StudentProfileBase):
    pass


class StudentProfileScoreUpdate(BaseModel):
    knowledge_score: float = ScoreField
    practice_score: float = ScoreField
    innovation_score: float = ScoreField
    exam_score: float = ScoreField
    efficiency_score: float = ScoreField
    quality_score: float = ScoreField


class RadarIndicator(BaseModel):
    name: str
    max: int = 100


class RadarChartData(BaseModel):
    indicators: list[RadarIndicator]
    values: list[float]


class StudentProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    major: str | None = None
    grade: str | None = None
    learning_goal: str | None = None
    current_level: str | None = None
    preferred_style: str | None = None
    available_time_per_week: float | None = None
    exam_pressure: str | None = None
    practice_experience: str | None = None
    weaknesses: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    knowledge_score: float
    practice_score: float
    innovation_score: float
    exam_score: float
    efficiency_score: float
    quality_score: float
    radar_chart_data: RadarChartData
    profile_summary: str | None = None
    profile_data: dict[str, Any]
    build_step: int
    is_complete: bool
    created_at: datetime
    updated_at: datetime


class ConversationMessage(BaseModel):
    role: Literal["assistant", "user", "system"]
    content: str = Field(min_length=1, max_length=3000)


class ProfileConversationRequest(BaseModel):
    message: str = Field(min_length=1, max_length=3000)
    conversation_history: list[ConversationMessage] = Field(default_factory=list)
    apply: bool = Field(default=False, description="Whether to apply extracted data to the current profile")


class ProfileConversationResponse(BaseModel):
    analysis: str
    extracted_profile: dict[str, Any]
    suggested_scores: dict[str, float]
    next_question: str | None = None
    applied: bool = False
    current_profile: StudentProfileRead | None = None


class ProfileQuestion(BaseModel):
    step: int
    key: str
    question: str


class ProfileQuestionsResponse(BaseModel):
    questions: list[ProfileQuestion]


class ProfileBuildRequest(BaseModel):
    step: int = Field(ge=1, le=8)
    answer: str = Field(min_length=1, max_length=3000)


class ProfileBuildResponse(BaseModel):
    step: int
    current_profile: StudentProfileRead
    next_question: str | None = None
    is_complete: bool


class ProfileOnboardingMessageRequest(BaseModel):
    conversation_id: int = Field(gt=0)
    answer: str = Field(min_length=1, max_length=3000)
    idempotency_key: str = Field(min_length=8, max_length=120)


class ProfileMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    step: str
    content: str
    question: str | None = None
    answer: str | None = None
    extracted_fields: dict[str, Any]
    dimension_updates: dict[str, Any]
    profile_before: dict[str, Any]
    profile_after: dict[str, Any]
    created_at: datetime


class ProfileOnboardingState(BaseModel):
    conversation_id: int
    mode: Literal["onboarding", "continuous"]
    status: str
    current_step: str
    current_question: str
    messages: list[ProfileMessageRead]
    current_profile: StudentProfileRead
    changed_fields: list[str] = Field(default_factory=list)
    changed_dimensions: list[str] = Field(default_factory=list)
    duplicate: bool = False


class ProfileEventRequest(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=160)
    source_type: Literal["test_completed", "path_step_completed", "project_completed", "resource_completed", "study_streak"]
    source_id: str | None = None
    reason: str = Field(min_length=1, max_length=1000)
    evidence: dict[str, Any] = Field(default_factory=dict)
    dimension: Literal["knowledge_score", "practice_score", "innovation_score", "exam_score", "efficiency_score", "quality_score"]
    observed_score: float = Field(ge=0, le=100)


class ProfileEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    idempotency_key: str
    source_type: str
    source_id: str | None
    reason: str
    evidence: dict[str, Any]
    before: dict[str, Any]
    after: dict[str, Any]
    created_at: datetime
