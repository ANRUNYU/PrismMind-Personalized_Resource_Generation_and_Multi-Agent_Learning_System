from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import KnowledgeDocumentStatus


class KnowledgeDocumentCreate(BaseModel):
    file_id: int = Field(gt=0, description="Uploaded file asset id")
    course_id: int | None = Field(default=None, description="Optional course id")
    title: str = Field(min_length=1, max_length=255, description="Knowledge document title")
    source_type: str = Field(default="upload", max_length=80, description="Knowledge document source type")


class KnowledgeDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    course_id: int | None = None
    file_asset_id: int | None = None
    title: str
    source_type: str
    status: KnowledgeDocumentStatus
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class KnowledgeDocumentListResponse(BaseModel):
    items: list[KnowledgeDocumentRead]
    total: int
    page: int
    page_size: int


class KnowledgeIngestResponse(BaseModel):
    document_id: int
    status: KnowledgeDocumentStatus
    chunk_count: int
    chroma_collection: str


class KnowledgeDeleteResponse(BaseModel):
    document_id: int
    deleted: bool = True
    deleted_chunks: int = 0


class KnowledgeRetrieveRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000, description="Retrieval query")
    course_id: int | None = Field(default=None, description="Optional course filter")
    document_id: int | None = Field(default=None, description="Optional document filter")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of chunks to retrieve")


class KnowledgeRetrieveResult(BaseModel):
    content: str
    metadata: dict[str, Any]
    score: float | None = None


class KnowledgeRetrieveResponse(BaseModel):
    query: str
    results: list[KnowledgeRetrieveResult]
