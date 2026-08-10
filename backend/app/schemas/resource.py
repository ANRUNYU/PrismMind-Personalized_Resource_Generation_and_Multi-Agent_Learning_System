from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.quality_analysis import QualityAnalysis


ResourceType = Literal[
    "course_document",
    "mind_map",
    "concept_explanation",
    "case_study",
    "further_reading",
    "video_script",
    "code_example",
    "practice_task",
    "summary_notes",
    "quiz",
    "project_hint",
]
ResourceDifficulty = Literal["easy", "normal", "hard"]

SUPPORTED_RESOURCE_TYPES = {
    "course_document",
    "mind_map",
    "concept_explanation",
    "case_study",
    "further_reading",
    "video_script",
    "code_example",
    "practice_task",
    "summary_notes",
    "quiz",
    "project_hint",
}


class ResourceGenerateRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=200, description="Learning topic")
    course_id: int | None = Field(default=None, description="Optional course id")
    resource_types: list[ResourceType] = Field(
        default_factory=lambda: ["concept_explanation"],
        min_length=1,
        description="Resource types to generate",
    )
    difficulty: ResourceDifficulty = Field(default="normal", description="Resource difficulty")
    knowledge_points: list[str] | None = Field(default=None, description="Optional knowledge points")
    use_profile: bool = Field(default=True, description="Whether to use the student's learning profile")
    use_knowledge_base: bool = Field(default=False, description="Whether to retrieve Chroma context")
    knowledge_document_ids: list[int] | None = Field(default=None, description="Optional ingested knowledge document ids")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of chunks to retrieve")
    additional_requirements: str | None = Field(default=None, max_length=3000)

    @field_validator("resource_types")
    @classmethod
    def dedupe_resource_types(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class ResourceGenerateSingleRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=200, description="Learning topic")
    course_id: int | None = Field(default=None, description="Optional course id")
    resource_type: ResourceType = Field(default="concept_explanation", description="Resource type")
    difficulty: ResourceDifficulty = Field(default="normal", description="Resource difficulty")
    knowledge_points: list[str] | None = Field(default=None, description="Optional knowledge points")
    use_profile: bool = Field(default=True, description="Whether to use the student's learning profile")
    use_knowledge_base: bool = Field(default=False, description="Whether to retrieve Chroma context")
    knowledge_document_ids: list[int] | None = Field(default=None, description="Optional ingested knowledge document ids")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of chunks to retrieve")
    additional_requirements: str | None = Field(default=None, max_length=3000)


class ResourceReference(BaseModel):
    document_id: int | None = None
    chunk_index: int | None = None
    source_filename: str | None = None
    excerpt: str | None = None
    score: float | None = None


class ResourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int | None = None
    resource_type: str
    title: str
    content: str
    topic: str | None = None
    difficulty_level: str | None = None
    tags: list = Field(default_factory=list)
    is_viewed: bool
    is_completed: bool
    user_rating: float | None = None
    created_at: datetime
    updated_at: datetime
    quality_analysis: QualityAnalysis | None = None
    profile_snapshot: dict[str, Any] | None = None
    reference_snapshot: list[dict[str, Any]] = Field(default_factory=list)
    generation_task_id: int | None = None
    generation_parameters: dict[str, Any] | None = None


class ResourceGenerateResponse(BaseModel):
    resources: list[ResourceRead]
    warnings: list[str] = Field(default_factory=list)
    references: list[ResourceReference] = Field(default_factory=list)


class ResourceListResponse(BaseModel):
    items: list[ResourceRead]
    total: int
    page: int
    page_size: int


class ResourceRatingRequest(BaseModel):
    user_rating: int = Field(ge=1, le=5, description="Rating from 1 to 5")


class ResourceActionResponse(BaseModel):
    resource_id: int
    is_viewed: bool
    is_completed: bool
    user_rating: float | None = None


class ResourceDeleteResponse(BaseModel):
    resource_id: int
    deleted: bool = True
