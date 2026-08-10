from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.file_asset import FileUploadResponse

AssistantMode = Literal["general", "course_qa", "file_qa"]
AssistantRole = Literal["user", "assistant", "system"]
AssistantAnswerStyle = Literal["normal", "step_by_step", "concise", "detailed"]


class AssistantReference(BaseModel):
    source_type: Literal["course_knowledge", "file"]
    title: str | None = None
    filename: str | None = None
    excerpt: str
    score: float | None = None
    document_id: int | None = None
    file_id: int | None = None
    chunk_index: int | None = None


class AssistantUsedDocument(BaseModel):
    title: str | None = None
    filename: str | None = None
    source_type: Literal["course_knowledge", "file"]


class AssistantMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    role: str
    content: str
    status: str = "completed"
    error_message: str | None = None
    completed_at: datetime | None = None
    references: list[AssistantReference] = Field(default_factory=list)
    attachment_file_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class AssistantSessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    course_id: int | None = None
    title: str
    mode: str
    status: str
    last_message: str | None = None
    message_count: int = 0
    created_at: datetime
    updated_at: datetime


class AssistantSessionListResponse(BaseModel):
    items: list[AssistantSessionSummary]
    total: int
    page: int
    page_size: int


class AssistantSessionDetail(AssistantSessionSummary):
    messages: list[AssistantMessageRead] = Field(default_factory=list)


class AssistantSessionCreate(BaseModel):
    course_id: int | None = Field(default=None, gt=0)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    mode: AssistantMode = "general"


class AssistantSendMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    course_id: int | None = Field(default=None, gt=0)
    use_course_knowledge: bool = True
    knowledge_document_ids: list[int] = Field(default_factory=list)
    attachment_file_ids: list[int] = Field(default_factory=list)
    answer_style: AssistantAnswerStyle = "normal"
    top_k: int = Field(default=5, ge=1, le=10)


class AssistantSendMessageResponse(BaseModel):
    session: AssistantSessionSummary
    user_message: AssistantMessageRead
    assistant_message: AssistantMessageRead
    answer: str
    references: list[AssistantReference] = Field(default_factory=list)
    used_documents: list[AssistantUsedDocument] = Field(default_factory=list)
    suggested_followups: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class AssistantFileUploadResponse(FileUploadResponse):
    pass


class AssistantDeleteResponse(BaseModel):
    session_id: int
    deleted: bool = True
