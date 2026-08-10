from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


TaskStatusValue = Literal["pending", "running", "success", "failed"]
TaskEventType = Literal["meta", "stage", "delta", "reference", "warning", "done", "error"]
TaskTypeValue = Literal[
    "teacher_training_plan",
    "teacher_course_design",
    "teacher_teaching_design",
    "teacher_exercise",
    "teacher_paper",
    "teacher_project",
    "knowledge_ingest",
    "document_parse",
    "student_resource_generation",
    "student_resource_single_generation",
    "student_test_generation",
    "report_generation",
]


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_type: str
    status: TaskStatusValue
    progress: int = Field(ge=0, le=100)
    result_artifact_id: int | None = None
    error_message: str | None = None
    current_stage: str | None = None
    status_message: str | None = None
    partial_content: str | None = None
    result_payload: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TaskDetail(TaskOut):
    input_payload: dict[str, Any] = Field(default_factory=dict)


class TaskListResponse(BaseModel):
    items: list[TaskOut]
    total: int
    page: int
    page_size: int


class TaskCreateResponse(BaseModel):
    task_id: int
    task_type: str
    status: TaskStatusValue
    polling_url: str
    stream_url: str | None = None


class TaskStreamEvent(BaseModel):
    type: TaskEventType
    event_id: str | None = None
    task_id: int
    stage: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    message: str | None = None
    text: str | None = None
    reference: dict[str, Any] | None = None
    result_payload: dict[str, Any] | None = None
    error: str | None = None
