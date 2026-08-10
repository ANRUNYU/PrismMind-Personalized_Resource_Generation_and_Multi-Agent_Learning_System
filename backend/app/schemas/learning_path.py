from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import LearningPathStatus


PathDifficulty = Literal["easy", "normal", "hard"]


class LearningPathCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    topic: str = Field(min_length=1, max_length=200)
    course_id: int | None = None
    target_goal: str = Field(min_length=1, max_length=3000)
    knowledge_points: list[str] | None = None
    duration_days: int = Field(default=7, ge=1, le=90)
    daily_minutes: int = Field(default=60, ge=10, le=480)
    difficulty: PathDifficulty = "normal"
    resource_ids: list[int] | None = None
    use_profile: bool = True
    use_existing_resources: bool = True
    use_knowledge_base: bool = False
    knowledge_document_ids: list[int] | None = None
    top_k: int = Field(default=8, ge=1, le=20)
    additional_requirements: str | None = Field(default=None, max_length=3000)


class LearningPathStep(BaseModel):
    id: int | None = None
    step_index: int
    title: str
    objective: str
    knowledge_points: list[str] = Field(default_factory=list)
    suggested_resource_ids: list[int] = Field(default_factory=list)
    learning_activity: str
    practice_task: str
    estimated_minutes: int
    completion_criteria: str
    status: str = "pending"
    knowledge_point: str | None = None
    description: str | None = None
    learning_objectives: list[str] = Field(default_factory=list)
    study_completed_at: datetime | None = None
    step_test_id: int | None = None
    pass_score: float = 60
    attempt_count: int = 0
    unlocked_at: datetime | None = None
    completed_at: datetime | None = None
    reflection: str | None = None
    topic: str | None = None
    course_id: int | None = None


class LearningPathMilestone(BaseModel):
    milestone_index: int
    title: str
    target_step_index: int
    description: str
    is_reached: bool = False


class LearningPathRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    topic: str | None = None
    current_step: int
    completion_rate: float
    status: LearningPathStatus
    path_steps: list[LearningPathStep]
    milestones: list[LearningPathMilestone]
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class LearningPathListResponse(BaseModel):
    items: list[LearningPathRead]
    total: int
    page: int
    page_size: int


class LearningPathAdvanceRequest(BaseModel):
    completed_step_index: int = Field(ge=0)
    reflection: str | None = Field(default=None, max_length=3000)
    time_spent_minutes: int | None = Field(default=None, ge=0, le=1440)


class LearningPathAdvanceResponse(BaseModel):
    path_id: int
    current_step: int
    completion_rate: float
    status: LearningPathStatus
    current_step_detail: LearningPathStep | None = None


class LearningPathQuizRequest(BaseModel):
    step_index: int = Field(ge=0)
    question_count: int = Field(default=5, ge=1, le=10)
    difficulty: PathDifficulty = "normal"


class LearningPathQuizQuestion(BaseModel):
    question: str
    answer: str


class LearningPathQuizResponse(BaseModel):
    path_id: int
    step_index: int
    quiz_markdown: str
    questions: list[LearningPathQuizQuestion]
    test_id: int | None = None


class LearningPathStepStudyCompleteRequest(BaseModel):
    reflection: str | None = Field(default=None, max_length=3000)
    time_spent_minutes: int | None = Field(default=None, ge=0, le=1440)


class LearningPathRecommendation(BaseModel):
    title: str
    reason: str
    suggested_action: str


class LearningPathRecommendationResponse(BaseModel):
    recommendations: list[LearningPathRecommendation]


class LearningPathRawUpdate(BaseModel):
    path_steps: list[dict[str, Any]]
    milestones: list[dict[str, Any]]
