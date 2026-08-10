from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, IdMixin, TimestampMixin, dict_default
from app.models.enums import KnowledgeDocumentStatus

if TYPE_CHECKING:
    from app.models.course import Course
    from app.models.file_asset import FileAsset
    from app.models.user import User


class KnowledgeDocument(IdMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = (
        Index("ix_knowledge_documents_owner_created_at", "owner_id", "created_at"),
        Index("ix_knowledge_documents_course_status", "course_id", "status"),
    )

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    file_asset_id: Mapped[int | None] = mapped_column(ForeignKey("file_assets.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False, default="file", server_default="file")
    status: Mapped[KnowledgeDocumentStatus] = mapped_column(
        Enum(KnowledgeDocumentStatus, name="knowledge_document_status"),
        nullable=False,
        default=KnowledgeDocumentStatus.pending,
        server_default=KnowledgeDocumentStatus.pending.value,
        index=True,
    )
    chunk_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    owner: Mapped[User] = relationship()
    course: Mapped[Course | None] = relationship(back_populates="knowledge_documents")
    file_asset: Mapped[FileAsset | None] = relationship(back_populates="knowledge_documents")
    chunks: Mapped[list[KnowledgeChunk]] = relationship(back_populates="document", cascade="all, delete-orphan")


class KnowledgeChunk(IdMixin, TimestampMixin, Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_chunks_document_index", "document_id", "chunk_index"),
        Index("ix_knowledge_chunks_course_document", "course_id", "document_id"),
        Index("ix_knowledge_chunks_chroma_id", "chroma_id"),
    )

    document_id: Mapped[int] = mapped_column(ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True, index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSONDict, nullable=False, default=dict_default)
    chroma_collection: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    chroma_id: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)

    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")
    course: Mapped[Course | None] = relationship()
