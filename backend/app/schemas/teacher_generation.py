from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ArtifactStatus, ArtifactType
from app.schemas.quality_analysis import QualityAnalysis

ShortText = Annotated[str, Field(min_length=1, max_length=255)]
LongText = Annotated[str, Field(min_length=1, max_length=5000)]


class GenerationReferenceMixin(BaseModel):
    course_id: int | None = Field(default=None, gt=0, description="Selected class/course used for aggregate student context")
    file_ids: list[int] | None = Field(default=None, description="Uploaded reference file ids")
    knowledge_document_ids: list[int] | None = Field(default=None, description="Ingested knowledge document ids")
    use_knowledge_base: bool = Field(default=False, description="Whether to retrieve Chroma knowledge context")
    retrieval_query: str | None = Field(default=None, max_length=2000, description="Optional retrieval query")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of Chroma chunks to retrieve")


class TrainingPlanGenerateRequest(GenerationReferenceMixin):
    program_name: ShortText = Field(description="Program name")
    education_level: ShortText = Field(description="Education level, for example undergraduate or vocational")
    major_name: ShortText = Field(description="Major name")
    training_objectives: LongText = Field(description="Training objectives")
    graduation_requirements: str | None = Field(default=None, max_length=5000, description="Graduation requirements")
    core_courses: list[str] | None = Field(default=None, description="Core courses")
    industry_requirements: str | None = Field(default=None, max_length=5000, description="Industry requirements")
    additional_requirements: str | None = Field(default=None, max_length=5000, description="Additional requirements")


class TrainingPlanExtractSkillsRequest(GenerationReferenceMixin):
    focus_prompt: str | None = Field(default=None, max_length=2000, description="Teacher focus prompt")
    additional_requirements: str | None = Field(default=None, max_length=5000, description="Additional requirements")
    raw_text: str | None = Field(default=None, max_length=10000, description="Plain text source")
    reference_text: str | None = Field(default=None, max_length=10000, description="Reference text")
    uploaded_file_id: int | None = Field(default=None, gt=0, description="Uploaded reference file id")


class TrainingPlanSkill(BaseModel):
    name: str
    category: str = "核心能力"
    level: str = "进阶"
    description: str
    related_courses: list[str] = Field(default_factory=list)
    weight: str | None = None


class TrainingPlanExtractSkillsResponse(BaseModel):
    skills: list[TrainingPlanSkill]
    summary: str
    suggested_objectives: list[str] = Field(default_factory=list)
    suggested_graduation_requirements: list[str] = Field(default_factory=list)
    suggested_core_courses: list[str] = Field(default_factory=list)
    industry_requirements: str | None = None
    warnings: list[str] = Field(default_factory=list)
    references: list["GenerationReference"] = Field(default_factory=list)
    quality_analysis: QualityAnalysis | None = None


class CourseDesignGenerateRequest(GenerationReferenceMixin):
    course_name: ShortText = Field(description="Course name")
    target_students: ShortText = Field(description="Target students")
    total_hours: int = Field(gt=0, le=512, description="Total teaching hours")
    course_objectives: LongText = Field(description="Course objectives")
    key_topics: list[str] | None = Field(default=None, description="Key topics")
    references: str | None = Field(default=None, max_length=5000, description="Plain text references")
    additional_requirements: str | None = Field(default=None, max_length=5000, description="Additional requirements")


class TeachingDesignGenerateRequest(GenerationReferenceMixin):
    course_name: ShortText = Field(description="Course name")
    lesson_topic: ShortText = Field(description="Lesson topic")
    target_students: ShortText = Field(description="Target students")
    teaching_objectives: LongText = Field(description="Teaching objectives")
    key_points: str | None = Field(default=None, max_length=3000, description="Key teaching points")
    difficult_points: str | None = Field(default=None, max_length=3000, description="Difficult teaching points")
    teaching_hours: int | None = Field(default=None, gt=0, le=64, description="Teaching hours")
    teaching_methods: list[str] | None = Field(default=None, description="Teaching methods")
    additional_requirements: str | None = Field(default=None, max_length=5000, description="Additional requirements")


class ExerciseGenerateRequest(GenerationReferenceMixin):
    course_name: ShortText = Field(description="Course name")
    knowledge_points: list[str] = Field(min_length=1, description="Knowledge points")
    difficulty: ShortText = Field(description="Difficulty level")
    question_types: list[str] = Field(min_length=1, description="Question types")
    question_count: int = Field(gt=0, le=100, description="Question count")
    reference_text: str | None = Field(default=None, max_length=10000, description="Plain text reference")
    additional_requirements: str | None = Field(default=None, max_length=5000, description="Additional requirements")


class PaperGenerateRequest(GenerationReferenceMixin):
    course_name: ShortText = Field(description="Course name")
    exam_scope: LongText = Field(description="Exam scope")
    total_score: int = Field(gt=0, le=300, description="Total score")
    duration_minutes: int = Field(gt=0, le=300, description="Duration in minutes")
    question_distribution: LongText = Field(description="Question distribution")
    difficulty_ratio: ShortText = Field(description="Difficulty ratio")
    additional_requirements: str | None = Field(default=None, max_length=5000, description="Additional requirements")


class ProjectPracticeGenerateRequest(GenerationReferenceMixin):
    course_name: ShortText = Field(description="Course name")
    target_students: ShortText = Field(description="Target students")
    project_topic: ShortText = Field(description="Project topic")
    expected_skills: list[str] = Field(min_length=1, description="Expected skills")
    project_duration: ShortText = Field(description="Project duration")
    team_size: str | None = Field(default=None, max_length=80, description="Team size")
    deliverables: list[str] | None = Field(default=None, description="Deliverables")
    evaluation_criteria: str | None = Field(default=None, max_length=5000, description="Evaluation criteria")
    additional_requirements: str | None = Field(default=None, max_length=5000, description="Additional requirements")


class GenerationReference(BaseModel):
    source_type: str = Field(description="file or knowledge_chunk")
    file_id: int | None = None
    document_id: int | None = None
    chunk_index: int | None = None
    source_filename: str | None = None
    excerpt: str | None = None


class TeacherGenerationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    artifact_id: int = Field(validation_alias="id")
    artifact_type: ArtifactType
    title: str
    content: str
    content_format: str
    status: ArtifactStatus
    created_at: datetime
    warnings: list[str] | None = None
    references: list[GenerationReference] | None = None
    quality_analysis: QualityAnalysis | None = None


class GeneratedArtifactListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    artifact_type: ArtifactType
    title: str
    content_format: str
    status: ArtifactStatus
    model_name: str | None = None
    created_at: datetime
    updated_at: datetime


class GeneratedArtifactDetailResponse(GeneratedArtifactListItem):
    content: str
    request_payload: dict[str, Any]
    token_usage: dict[str, Any] | None = None
    quality_analysis: QualityAnalysis | None = None


class GeneratedArtifactListResponse(BaseModel):
    items: list[GeneratedArtifactListItem]
    total: int
    page: int
    page_size: int
