from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.enums import KnowledgeDocumentStatus, UserRole
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.models.user import User


class KnowledgeRepository:
    def create_document(
        self,
        db: Session,
        *,
        owner_id: int,
        file_asset_id: int,
        title: str,
        source_type: str = "upload",
        course_id: int | None = None,
        status: KnowledgeDocumentStatus = KnowledgeDocumentStatus.pending,
    ) -> KnowledgeDocument:
        document = KnowledgeDocument(
            owner_id=owner_id,
            file_asset_id=file_asset_id,
            title=title,
            source_type=source_type,
            course_id=course_id,
            status=status,
            chunk_count=0,
        )
        db.add(document)
        db.commit()
        db.refresh(document)
        return document

    def get_document(self, db: Session, document_id: int) -> KnowledgeDocument | None:
        return db.get(KnowledgeDocument, document_id)

    def get_document_by_file_course(
        self,
        db: Session,
        *,
        file_asset_id: int,
        course_id: int | None,
    ) -> KnowledgeDocument | None:
        return db.scalar(
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.file_asset_id == file_asset_id,
                KnowledgeDocument.course_id == course_id,
            )
            .order_by(KnowledgeDocument.id.desc())
            .limit(1)
        )

    def get_personal_copy(
        self,
        db: Session,
        *,
        owner_id: int,
        source_document_id: int,
    ) -> KnowledgeDocument | None:
        return db.scalar(
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.owner_id == owner_id,
                KnowledgeDocument.course_id.is_(None),
                KnowledgeDocument.source_type == f"course_copy:{source_document_id}",
            )
            .order_by(KnowledgeDocument.id.desc())
            .limit(1)
        )

    def list_personal_copies(
        self,
        db: Session,
        *,
        owner_id: int,
        source_document_ids: list[int],
    ) -> dict[int, KnowledgeDocument]:
        source_ids = list(dict.fromkeys(source_document_ids))
        if not source_ids:
            return {}

        source_types = {f"course_copy:{source_id}": source_id for source_id in source_ids}
        documents = db.scalars(
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.owner_id == owner_id,
                KnowledgeDocument.course_id.is_(None),
                KnowledgeDocument.source_type.in_(source_types),
            )
            .order_by(KnowledgeDocument.id.desc())
        )
        copies: dict[int, KnowledgeDocument] = {}
        for document in documents:
            source_id = source_types.get(document.source_type)
            if source_id is not None:
                copies.setdefault(source_id, document)
        return copies

    def list_documents_for_reindex(
        self, db: Session, *, document_ids: list[int] | None = None,
        course_id: int | None = None, resume_from: int | None = None,
    ) -> list[KnowledgeDocument]:
        stmt = select(KnowledgeDocument).where(KnowledgeDocument.file_asset_id.is_not(None))
        if document_ids:
            stmt = stmt.where(KnowledgeDocument.id.in_(list(dict.fromkeys(document_ids))))
        if course_id is not None:
            stmt = stmt.where(KnowledgeDocument.course_id == course_id)
        if resume_from is not None:
            stmt = stmt.where(KnowledgeDocument.id >= resume_from)
        return list(db.scalars(stmt.order_by(KnowledgeDocument.id)))

    def list_documents(
        self,
        db: Session,
        *,
        owner_id: int | None = None,
        include_all: bool = False,
        course_id: int | None = None,
        status: KnowledgeDocumentStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[KnowledgeDocument], int]:
        stmt = select(KnowledgeDocument)
        count_stmt = select(func.count()).select_from(KnowledgeDocument)
        filters = []
        if not include_all:
            filters.append(KnowledgeDocument.owner_id == owner_id)
        if course_id is not None:
            filters.append(KnowledgeDocument.course_id == course_id)
        if status is not None:
            filters.append(KnowledgeDocument.status == status)
        if filters:
            stmt = stmt.where(*filters)
            count_stmt = count_stmt.where(*filters)

        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_ingested_documents_for_owner(
        self,
        db: Session,
        *,
        owner_id: int,
        course_id: int | None = None,
    ) -> list[KnowledgeDocument]:
        """Return the owner's current, usable knowledge documents without pagination."""
        stmt = select(KnowledgeDocument).where(
            KnowledgeDocument.owner_id == owner_id,
            KnowledgeDocument.status == KnowledgeDocumentStatus.ingested,
            KnowledgeDocument.file_asset_id.is_not(None),
        )
        if course_id is not None:
            stmt = stmt.where(KnowledgeDocument.course_id == course_id)
        return list(db.scalars(stmt.order_by(KnowledgeDocument.id)))

    def update_document_status(
        self,
        db: Session,
        *,
        document_id: int,
        status: KnowledgeDocumentStatus,
        chunk_count: int | None = None,
    ) -> KnowledgeDocument | None:
        document = self.get_document(db, document_id)
        if document is None:
            return None
        document.status = status
        if chunk_count is not None:
            document.chunk_count = chunk_count
        db.add(document)
        db.commit()
        db.refresh(document)
        return document

    def create_chunks(
        self,
        db: Session,
        *,
        document_id: int,
        course_id: int | None,
        chunks: list[dict[str, Any]],
        chroma_collection: str,
    ) -> list[KnowledgeChunk]:
        chunk_models = [
            KnowledgeChunk(
                document_id=document_id,
                course_id=course_id,
                chunk_index=chunk["chunk_index"],
                content=chunk["content"],
                metadata_=chunk["metadata"],
                chroma_collection=chroma_collection,
                chroma_id=chunk["chroma_id"],
            )
            for chunk in chunks
        ]
        db.add_all(chunk_models)
        db.commit()
        for chunk_model in chunk_models:
            db.refresh(chunk_model)
        return chunk_models

    def list_chunks_by_document(self, db: Session, document_id: int) -> list[KnowledgeChunk]:
        stmt = select(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id).order_by(KnowledgeChunk.chunk_index)
        return list(db.scalars(stmt))

    def delete_chunks_by_document(self, db: Session, document_id: int) -> int:
        result = db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id))
        db.commit()
        return result.rowcount or 0

    def delete_document(self, db: Session, document: KnowledgeDocument) -> None:
        db.delete(document)
        db.commit()

    def check_owner_or_admin(self, document: KnowledgeDocument, current_user: User) -> bool:
        return document.owner_id == current_user.id or current_user.role == UserRole.admin

    def get_accessible_document(
        self,
        db: Session,
        *,
        document_id: int,
        current_user: User,
    ) -> tuple[KnowledgeDocument | None, bool]:
        document = self.get_document(db, document_id)
        if document is None:
            return None, False
        return document, self.check_owner_or_admin(document, current_user)

    def list_accessible_documents_by_ids(
        self,
        db: Session,
        *,
        document_ids: list[int],
        current_user: User,
    ) -> tuple[list[KnowledgeDocument], list[int], list[int]]:
        if not document_ids:
            return [], [], []

        unique_ids = list(dict.fromkeys(document_ids))
        stmt = select(KnowledgeDocument).where(KnowledgeDocument.id.in_(unique_ids))
        documents = list(db.scalars(stmt))
        by_id = {document.id: document for document in documents}

        missing_ids = [document_id for document_id in unique_ids if document_id not in by_id]
        forbidden_ids = [
            document.id
            for document in documents
            if not self.check_owner_or_admin(document, current_user)
        ]
        accessible_documents = [
            document
            for document in documents
            if self.check_owner_or_admin(document, current_user)
        ]
        return accessible_documents, missing_ids, forbidden_ids


knowledge_repository = KnowledgeRepository()
