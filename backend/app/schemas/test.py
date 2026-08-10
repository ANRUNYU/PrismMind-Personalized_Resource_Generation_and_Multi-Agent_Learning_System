from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.quality_analysis import QualityAnalysis


QuestionType = Literal["single_choice", "multiple_choice", "true_false", "short_answer"]
TestDifficulty = Literal["easy", "medium", "hard", "mixed"]
StudentTestStatus = Literal["generated", "in_progress", "submitted", "cancelled"]


class TestQuestionOption(BaseModel):
    key: str
    text: str


class TestQuestion(BaseModel):
    id: str
    question_type: QuestionType
    stem: str
    options: list[TestQuestionOption] = Field(default_factory=list)
    knowledge_points: list[str] = Field(default_factory=list)
    score: float = Field(ge=0, le=100)


class TestAnswerDetail(BaseModel):
    answer: Any
    analysis: str | None = None
    keywords: list[str] = Field(default_factory=list)


class StudentTestGenerateRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=160)
    difficulty: TestDifficulty = "medium"
    question_count: int = Field(default=5, ge=1, le=20)
    question_types: list[QuestionType] = Field(
        default_factory=lambda: ["single_choice", "multiple_choice", "true_false", "short_answer"],
        min_length=1,
    )
    knowledge_points: list[str] = Field(default_factory=list)
    resource_id: int | None = Field(default=None, gt=0)
    path_id: int | None = Field(default=None, gt=0)
    learning_path_id: int | None = Field(default=None, gt=0)
    learning_path_step_id: int | None = Field(default=None, gt=0)
    file_ids: list[int] = Field(default_factory=list)
    knowledge_document_ids: list[int] = Field(default_factory=list)
    use_knowledge_base: bool = False
    top_k: int = Field(default=5, ge=1, le=20)
    course_id: int | None = Field(default=None, gt=0)
    use_question_bank: bool = True

    @field_validator("question_types")
    @classmethod
    def dedupe_question_types(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class StudentTestSummary(BaseModel):
    id: int
    topic: str
    difficulty: str | None = None
    status: StudentTestStatus
    score: float | None = None
    question_count: int
    total_score: float
    created_at: datetime
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    learning_path_id: int | None = None
    learning_path_step_id: int | None = None
    source_type: str | None = None


class StudentTestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    topic: str
    difficulty: str | None = None
    status: StudentTestStatus
    questions: list[TestQuestion]
    total_score: float
    score: float | None = None
    analysis: str | None = None
    feedback: str | None = None
    user_answers: dict[str, Any] = Field(default_factory=dict)
    answers: dict[str, TestAnswerDetail] | None = None
    question_results: list[dict[str, Any]] = Field(default_factory=list)
    quality_analysis: QualityAnalysis | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    learning_path_id: int | None = None
    learning_path_step_id: int | None = None
    resource_id: int | None = None
    source_type: str | None = None
    evidence_snapshot: dict[str, Any] = Field(default_factory=dict)
    source_file_ids: list[int] = Field(default_factory=list)
    source_document_ids: list[int] = Field(default_factory=list)
    source_chunk_ids: list[int | str] = Field(default_factory=list)
    generation_parameters: dict[str, Any] = Field(default_factory=dict)


class StudentTestGenerateResponse(BaseModel):
    test_id: int
    topic: str
    difficulty: str | None = None
    status: StudentTestStatus
    questions: list[TestQuestion]
    question_count: int
    created_at: datetime
    references: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    quality_analysis: QualityAnalysis | None = None


class StudentTestListResponse(BaseModel):
    items: list[StudentTestSummary]
    total: int
    page: int
    page_size: int


class StudentTestSubmitRequest(BaseModel):
    user_answers: dict[str, Any] = Field(default_factory=dict)


class StudentTestSubmitResponse(BaseModel):
    test_id: int
    status: StudentTestStatus
    score: float
    analysis: str
    feedback: str
    question_results: list[dict[str, Any]]
    answers: dict[str, TestAnswerDetail]
    assessment_id: int | None = None
    quality_analysis: QualityAnalysis | None = None
