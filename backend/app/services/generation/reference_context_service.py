from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.models.enums import FileParseStatus, KnowledgeDocumentStatus, UserRole
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.models.user import User
from app.repositories.file_repository import file_repository
from app.repositories.knowledge_repository import knowledge_repository
from app.services.documents.parser import DocumentParseError, parse_document
from app.services.documents.storage import get_file_path


@dataclass
class ReferenceContext:
    text: str = ""
    references: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    evidence_snapshot: dict[str, Any] = field(default_factory=dict)


class ReferenceContextService:
    """Build the exact, permission-checked evidence supplied to generation."""

    def build(
        self, db: Session, *, current_user: User, file_ids: list[int] | None = None,
        knowledge_document_ids: list[int] | None = None, use_knowledge_base: bool = False,
        top_k: int = 5, course_id: int | None = None, query: str = "",
    ) -> ReferenceContext:
        file_ids = list(dict.fromkeys(file_ids or []))
        document_ids = list(dict.fromkeys(knowledge_document_ids or []))
        references: list[dict[str, Any]] = []
        warnings: list[str] = []
        sections: list[str] = []

        for file_id in file_ids:
            asset, accessible = file_repository.get_accessible_file(db, file_id=file_id, current_user=current_user)
            if asset is None:
                raise NotFoundException(f"File {file_id} not found")
            if not accessible:
                raise ForbiddenException(f"No permission to use file {file_id}")
            db.refresh(asset)
            if asset.parse_status in {FileParseStatus.pending, FileParseStatus.parsing}:
                raise BadRequestException(f"文件“{asset.original_filename}”仍在解析中，请等待解析完成后重试")
            if asset.parse_status == FileParseStatus.failed:
                raise BadRequestException(f"文件“{asset.original_filename}”解析失败：{asset.parse_error or '未知错误'}")
            if asset.parse_status != FileParseStatus.parsed:
                raise BadRequestException(f"文件“{asset.original_filename}”当前状态不可用于生成")
            try:
                content = parse_document(get_file_path(asset.storage_path), Path(asset.original_filename).suffix).strip()
            except DocumentParseError as exc:
                raise BadRequestException(f"File {file_id} cannot be parsed: {exc}") from exc
            excerpt = content[:8000]
            if not excerpt:
                raise BadRequestException(f"File {file_id} contains no usable text")
            ref = {
                "source_type": "file", "file_id": asset.id, "source_filename": asset.original_filename,
                "chunk_id": f"file:{asset.id}", "excerpt": excerpt, "reference_text": excerpt,
                "source_hash": asset.file_hash, "source_version": str(asset.updated_at),
            }
            references.append(ref)
            sections.append(f"[file:{asset.id} {asset.original_filename}]\n{excerpt}")

        documents: list[KnowledgeDocument] = []
        if document_ids:
            documents, missing, forbidden = knowledge_repository.list_accessible_documents_by_ids(
                db, document_ids=document_ids, current_user=current_user,
            )
            if missing:
                raise NotFoundException(f"Knowledge document {missing[0]} not found")
            if forbidden:
                raise ForbiddenException(f"No permission to use knowledge document {forbidden[0]}")
        elif use_knowledge_base:
            stmt = select(KnowledgeDocument).where(KnowledgeDocument.owner_id == current_user.id)
            if course_id is not None:
                stmt = stmt.where(KnowledgeDocument.course_id == course_id)
            documents = list(db.scalars(stmt.order_by(KnowledgeDocument.updated_at.desc()).limit(20)))

        for document in documents:
            if current_user.role != UserRole.admin and document.owner_id != current_user.id:
                raise ForbiddenException(f"No permission to use knowledge document {document.id}")
            if document.status != KnowledgeDocumentStatus.ingested:
                raise BadRequestException(f"Knowledge document {document.id} is not ready for question generation")
            chunks = list(db.scalars(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id)
                .order_by(KnowledgeChunk.chunk_index).limit(max(1, min(top_k, 20)))
            ))
            for chunk in chunks:
                ref = {
                    "source_type": "knowledge", "knowledge_document_id": document.id,
                    "chunk_id": chunk.id, "vector_id": chunk.chroma_id, "excerpt": chunk.content,
                    "reference_text": chunk.content, "source_filename": document.title,
                    "source_hash": (chunk.metadata_ or {}).get("source_hash"),
                    "source_version": (chunk.metadata_ or {}).get("source_version") or str(document.updated_at),
                    "similarity": (chunk.metadata_ or {}).get("similarity"),
                }
                references.append(ref)
                sections.append(f"[document:{document.id} chunk:{chunk.id}]\n{chunk.content}")
            if not chunks:
                warnings.append(f"Knowledge document {document.id} has no available chunks")

        if (file_ids or document_ids or use_knowledge_base) and not references:
            warnings.append("No usable evidence was found for this generation")
        snapshot = {
            "query": query, "source_file_ids": file_ids,
            "source_document_ids": [doc.id for doc in documents],
            "source_chunk_ids": [ref["chunk_id"] for ref in references if ref["source_type"] == "knowledge"],
            "references": references, "warnings": warnings,
        }
        return ReferenceContext("\n\n".join(sections), references, warnings, snapshot)


reference_context_service = ReferenceContextService()
