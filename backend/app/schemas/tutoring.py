from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ResponseFormat = Literal["markdown", "plain"]
TutorDifficulty = Literal["easy", "normal", "advanced"]
TutoringSessionType = Literal["ask", "hint", "explain"]


class TutoringKnowledgeMixin(BaseModel):
    course_id: int | None = Field(default=None, description="Optional course filter")
    knowledge_document_ids: list[int] | None = Field(default=None, description="Optional ingested knowledge document ids")
    use_knowledge_base: bool = Field(default=True, description="Whether to retrieve Chroma context")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of chunks to retrieve")
    difficulty: TutorDifficulty = Field(default="normal", description="Tutoring explanation level")


class TutoringAskRequest(TutoringKnowledgeMixin):
    question: str = Field(min_length=2, max_length=1000, description="Student question")
    response_format: ResponseFormat = Field(default="markdown", description="Answer format")


class TutoringHintRequest(TutoringKnowledgeMixin):
    question: str = Field(min_length=2, max_length=1000, description="Student question")
    context: str | None = Field(default=None, max_length=3000, description="Student's current context or confusion")
    response_format: ResponseFormat = Field(default="markdown", description="Hint format")


class TutoringExplainRequest(TutoringKnowledgeMixin):
    concept: str = Field(min_length=1, max_length=255, description="Concept to explain")
    response_format: ResponseFormat = Field(default="markdown", description="Explanation format")


class TutoringReference(BaseModel):
    document_id: int | None = None
    chunk_index: int | None = None
    source_filename: str | None = None
    excerpt: str | None = None
    score: float | None = None


class TutoringAskResponse(BaseModel):
    session_id: int
    question: str
    answer: str
    references: list[TutoringReference] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    used_knowledge_base: bool
    response_format: ResponseFormat
    created_at: datetime


class TutoringHintResponse(BaseModel):
    session_id: int
    question: str
    hint: str
    references: list[TutoringReference] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    used_knowledge_base: bool
    response_format: ResponseFormat
    created_at: datetime


class TutoringExplainResponse(BaseModel):
    session_id: int
    concept: str
    explanation: str
    references: list[TutoringReference] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    used_knowledge_base: bool
    response_format: ResponseFormat
    created_at: datetime


class TutoringSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    course_id: int | None = None
    topic: str | None = None
    session_type: str
    user_question: str
    ai_response: str
    response_format: str
    context_refs: list
    is_helpful: bool | None = None
    user_rating: float | None = None
    created_at: datetime
    updated_at: datetime


class TutoringSessionListResponse(BaseModel):
    items: list[TutoringSessionRead]
    total: int
    page: int
    page_size: int


class TutoringRatingRequest(BaseModel):
    is_helpful: bool
    user_rating: int = Field(ge=1, le=5, description="Rating from 1 to 5")


class TutoringRatingResponse(BaseModel):
    session_id: int
    is_helpful: bool
    user_rating: float


class TutoringConversationCreate(BaseModel):
    course_id: int | None = None
    title: str = Field(default="新辅导会话", min_length=1, max_length=255)


class TutoringMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    client_message_id: str = Field(min_length=1, max_length=100)
    retry_assistant_message_id: int | None = None
    use_knowledge_base: bool = True
    top_k: int = Field(default=5, ge=1, le=10)


class TutoringMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; conversation_id: int; role: str; content: str; status: str
    references: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: str | None = None
    client_message_id: str | None = None
    created_at: datetime; updated_at: datetime


class TutoringConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; user_id: int; course_id: int | None = None; title: str
    messages: list[TutoringMessageRead] = Field(default_factory=list)
    created_at: datetime; updated_at: datetime
