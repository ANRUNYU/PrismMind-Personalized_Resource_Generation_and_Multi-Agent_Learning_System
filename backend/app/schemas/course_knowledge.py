from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import FileParseStatus, KnowledgeDocumentStatus
from app.schemas.task import TaskCreateResponse


class CourseFileRead(BaseModel):
    id: int
    original_filename: str
    content_type: str | None = None
    file_size: int
    asset_type: str
    parse_status: FileParseStatus
    created_at: datetime
    updated_at: datetime
    usable_for_course_knowledge: bool = True


class CourseFileListResponse(BaseModel):
    items: list[CourseFileRead]
    total: int


class CourseKnowledgeDocumentCreate(BaseModel):
    file_id: int = Field(gt=0)
    title: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)


class CourseKnowledgeDocumentRead(BaseModel):
    id: int
    title: str
    file_id: int | None = None
    filename: str | None = None
    status: KnowledgeDocumentStatus
    chunk_count: int
    created_at: datetime
    updated_at: datetime
    owner_name: str | None = None
    course_id: int
    ingest_task_id: int | None = None
    added_to_personal: bool = False
    personal_document_id: int | None = None
    personal_document_status: KnowledgeDocumentStatus | None = None


class CourseKnowledgeDocumentListResponse(BaseModel):
    items: list[CourseKnowledgeDocumentRead]
    total: int
    page: int
    page_size: int


class CourseKnowledgeIngestResponse(BaseModel):
    document_id: int
    status: KnowledgeDocumentStatus
    chunk_count: int
    chroma_collection: str


class CourseKnowledgeDeleteResponse(BaseModel):
    document_id: int
    deleted: bool = True
    deleted_chunks: int = 0


class CourseKnowledgeCopyResponse(BaseModel):
    source_document_id: int
    personal_document_id: int
    personal_file_id: int | None = None
    status: KnowledgeDocumentStatus
    chunk_count: int = 0
    already_added: bool = False


class CourseKnowledgeRetrieveRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)
    document_ids: list[int] | None = None


class CourseKnowledgeRetrieveResult(BaseModel):
    content: str
    metadata: dict[str, Any]
    score: float | None = None
    document_id: int | None = None
    title: str | None = None
    filename: str | None = None


class CourseKnowledgeRetrieveResponse(BaseModel):
    query: str
    results: list[CourseKnowledgeRetrieveResult]


class CourseKnowledgeAsyncIngestResponse(TaskCreateResponse):
    pass
