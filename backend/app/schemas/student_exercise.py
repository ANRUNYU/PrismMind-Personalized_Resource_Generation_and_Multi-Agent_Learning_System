from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.quality_analysis import QualityAnalysis
from app.schemas.test import TestAnswerDetail, TestQuestion


StudentExerciseSource = Literal["personal", "assignment"]
StudentExerciseStatus = Literal["not_started", "in_progress", "submitted", "graded", "completed"]
StudentExerciseDifficulty = Literal["easy", "medium", "hard"]


class StudentExerciseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    content: str = Field(min_length=1, max_length=6000)
    answer: str | None = Field(default=None, max_length=6000)
    explanation: str | None = Field(default=None, max_length=6000)
    difficulty: StudentExerciseDifficulty | str = "medium"
    category: str = Field(default="个人习题", min_length=1, max_length=80)
    tags: list[str] = Field(default_factory=list)
    total_score: float = Field(default=100.0, ge=1, le=100)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        return [item for item in dict.fromkeys(str(tag).strip() for tag in value) if item][:8]


class StudentExerciseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    content: str | None = Field(default=None, min_length=1, max_length=6000)
    answer: str | None = Field(default=None, max_length=6000)
    explanation: str | None = Field(default=None, max_length=6000)
    difficulty: StudentExerciseDifficulty | str | None = None
    category: str | None = Field(default=None, min_length=1, max_length=80)
    tags: list[str] | None = None
    total_score: float | None = Field(default=None, ge=1, le=100)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return [item for item in dict.fromkeys(str(tag).strip() for tag in value) if item][:8]


class StudentExerciseSubmitRequest(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class StudentExerciseSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source: StudentExerciseSource
    personal_id: int | None = None
    course_id: int | None = None
    assignment_id: int | None = None
    course_name: str | None = None
    title: str
    description: str | None = None
    content: str | None = None
    category: str
    difficulty: str
    status: str
    status_label: str | None = None
    is_favorite: bool = False
    score: float | None = None
    total_score: float
    tags: list[str] = Field(default_factory=list)
    question_count: int = 1
    due_at: datetime | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class StudentExerciseRead(StudentExerciseSummary):
    questions: list[TestQuestion] = Field(default_factory=list)
    answer_key: dict[str, TestAnswerDetail] | None = None
    explanation: str | None = None
    feedback: str | None = None
    user_answers: dict[str, Any] = Field(default_factory=dict)
    question_results: list[dict[str, Any]] = Field(default_factory=list)
    quality_analysis: QualityAnalysis | dict[str, Any] | None = None


class StudentExerciseListResponse(BaseModel):
    items: list[StudentExerciseSummary]
    total: int
    page: int
    page_size: int


class StudentExerciseStartResponse(BaseModel):
    exercise: StudentExerciseRead


class StudentExerciseSubmitResponse(BaseModel):
    exercise: StudentExerciseRead
    status: str
    score: float
    max_score: float
    analysis: str
    feedback: str
    question_results: list[dict[str, Any]]
    answer_key: dict[str, TestAnswerDetail] | dict[str, Any]
    quality_analysis: QualityAnalysis | dict[str, Any] | None = None
