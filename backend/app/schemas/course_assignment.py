from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.quality_analysis import QualityAnalysis
from app.schemas.test import QuestionType, TestAnswerDetail, TestQuestion


CourseAssignmentType = Literal["quiz", "exam", "homework"]
CourseAssignmentSource = Literal["manual", "ai_generated"]
CourseAssignmentDifficulty = Literal["easy", "medium", "hard"]
CourseAssignmentStatus = Literal["draft", "published", "closed", "archived"]
CourseAssignmentSubmissionStatus = Literal["not_started", "in_progress", "submitted", "graded"]
CourseAssignmentGenerationMode = Literal["ai", "manual"]


class CourseAssignmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    assignment_type: CourseAssignmentType = "quiz"
    difficulty: CourseAssignmentDifficulty = "medium"
    question_count: int = Field(default=5, ge=1, le=20)
    total_score: float = Field(default=100.0, ge=1, le=100)
    time_limit_minutes: int | None = Field(default=None, ge=1, le=600)
    due_at: datetime | None = None
    status: CourseAssignmentStatus = "published"
    knowledge_document_ids: list[int] = Field(default_factory=list)
    generation_mode: CourseAssignmentGenerationMode = "ai"
    topic: str | None = Field(default=None, max_length=255)
    question_types: list[QuestionType] = Field(
        default_factory=lambda: ["single_choice", "multiple_choice", "true_false", "short_answer"],
        min_length=1,
    )

    @field_validator("knowledge_document_ids")
    @classmethod
    def dedupe_document_ids(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))

    @field_validator("question_types")
    @classmethod
    def dedupe_question_types(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class CourseAssignmentSubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assignment_id: int
    course_id: int
    student_id: int | None = None
    student_username: str | None = None
    student_full_name: str | None = None
    status: CourseAssignmentSubmissionStatus | str
    answers: dict[str, Any] = Field(default_factory=dict)
    score: float | None = None
    max_score: float
    feedback: dict[str, Any] = Field(default_factory=dict)
    question_results: list[dict[str, Any]] = Field(default_factory=list)
    quality_analysis: QualityAnalysis | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    graded_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CourseWeakTopicStat(BaseModel):
    topic: str
    student_count: int = 0
    occurrence_count: int = 0
    rate: float = 0.0


class CourseTeachingDiagnostics(BaseModel):
    submitted_count: int = 0
    average_score: float | None = None
    average_score_rate: float | None = None
    weak_topics: list[CourseWeakTopicStat] = Field(default_factory=list)
    strong_topics: list[str] = Field(default_factory=list)
    evaluation: str = "暂无学生提交，暂不能形成教学诊断。"
    teaching_focus: list[str] = Field(default_factory=list)


class CourseAssignmentSummary(BaseModel):
    id: int
    course_id: int
    title: str
    description: str | None = None
    assignment_type: CourseAssignmentType | str
    source: CourseAssignmentSource | str
    difficulty: CourseAssignmentDifficulty | str
    topic: str | None = None
    question_count: int
    total_score: float
    time_limit_minutes: int | None = None
    due_at: datetime | None = None
    status: CourseAssignmentStatus | str
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    submitted_count: int | None = None
    current_student_submission_status: CourseAssignmentSubmissionStatus | str | None = None
    current_student_score: float | None = None


class CourseAssignmentListResponse(BaseModel):
    items: list[CourseAssignmentSummary]
    total: int
    page: int
    page_size: int


class CourseAssignmentRead(CourseAssignmentSummary):
    knowledge_document_ids: list[int] = Field(default_factory=list)
    questions: list[TestQuestion] = Field(default_factory=list)
    answer_key: dict[str, TestAnswerDetail] | None = None
    explanations: dict[str, Any] = Field(default_factory=dict)
    current_student_submission: CourseAssignmentSubmissionRead | None = None
    submissions_total: int | None = None
    quality_analysis: QualityAnalysis | None = None


class CourseAssignmentStartResponse(BaseModel):
    assignment: CourseAssignmentRead
    submission: CourseAssignmentSubmissionRead


class CourseAssignmentSubmitRequest(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class CourseAssignmentSubmitResponse(BaseModel):
    assignment_id: int
    submission_id: int
    status: CourseAssignmentSubmissionStatus | str
    score: float
    max_score: float
    analysis: str
    feedback: str
    question_results: list[dict[str, Any]]
    answer_key: dict[str, TestAnswerDetail]
    recommendations: list[str] = Field(default_factory=list)
    quality_analysis: QualityAnalysis | None = None
    profile_snapshot: dict[str, Any] = Field(default_factory=dict)


class CourseAssignmentSubmissionListResponse(BaseModel):
    items: list[CourseAssignmentSubmissionRead]
    total: int
    page: int
    page_size: int
    diagnostics: CourseTeachingDiagnostics = Field(default_factory=CourseTeachingDiagnostics)
