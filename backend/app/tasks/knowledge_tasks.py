from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.models.enums import KnowledgeDocumentStatus, TaskStatus
from app.repositories.file_repository import file_repository
from app.repositories.knowledge_repository import knowledge_repository
from app.repositories.task_repository import task_repository
from app.services.rag.ingestion import ingest_document
from app.services.rag.ingestion import index_document
from app.services.rag.chroma_store import count_by_document_id, switch_active_collection
from app.core.config import get_settings
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.knowledge_tasks.run_knowledge_ingest_task")
def run_knowledge_ingest_task(task_id: int) -> dict:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")

    db = SessionLocal()
    document_id: int | None = None
    try:
        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise RuntimeError(f"Knowledge ingest task {task_id} not found")
        if task.task_type != "knowledge_ingest":
            raise RuntimeError(f"Task {task_id} is not a knowledge_ingest task")

        task_repository.update_task_status(db, task=task, status=TaskStatus.running, progress=10)
        document_id = int((task.input_payload or {}).get("document_id") or 0)
        if document_id <= 0:
            raise RuntimeError("Task input_payload is missing document_id")

        document = knowledge_repository.get_document(db, document_id)
        if document is None:
            raise RuntimeError(f"Knowledge document {document_id} not found")
        if document.file_asset_id is None:
            raise RuntimeError(f"Knowledge document {document_id} has no source file")

        file_asset = file_repository.get_by_id(db, document.file_asset_id)
        if file_asset is None:
            raise RuntimeError(f"Source file asset {document.file_asset_id} not found")

        knowledge_repository.update_document_status(
            db,
            document_id=document.id,
            status=KnowledgeDocumentStatus.parsing,
        )
        task = task_repository.get_task_by_id(db, task_id)
        if task is not None:
            task_repository.update_task_status(db, task=task, status=TaskStatus.running, progress=20)

        chunk_count = ingest_document(db, document=document, file_asset=file_asset)

        completed_document = knowledge_repository.get_document(db, document_id)
        if (
            completed_document is None
            or completed_document.status != KnowledgeDocumentStatus.ingested
            or completed_document.chunk_count <= 0
        ):
            raise RuntimeError("Knowledge document chunks were saved but the final document state is not ready")

        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise RuntimeError(f"Knowledge ingest task {task_id} disappeared before success update")
        task_repository.update_task_status(db, task=task, status=TaskStatus.running, progress=90)
        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise RuntimeError(f"Knowledge ingest task {task_id} disappeared before final update")
        result_payload = {
            "task_id": task_id,
            "document_id": completed_document.id,
            "chunk_count": completed_document.chunk_count,
            "status": "success",
        }
        task_repository.mark_task_success(db, task=task, result_payload=result_payload)
        return result_payload
    except Exception as exc:
        logger.exception("Knowledge ingest task failed: %s", task_id)
        try:
            db.rollback()
            original_task = task_repository.get_task_by_id(db, task_id)
            input_payload = dict(original_task.input_payload or {}) if original_task is not None else {}
            completed_document = knowledge_repository.get_document(db, document_id) if document_id else None
            if completed_document is None and input_payload.get("file_asset_id"):
                completed_document = knowledge_repository.get_document_by_file_course(
                    db,
                    file_asset_id=int(input_payload["file_asset_id"]),
                    course_id=input_payload.get("course_id"),
                )
            if (
                completed_document is not None
                and completed_document.status == KnowledgeDocumentStatus.ingested
                and completed_document.chunk_count > 0
            ):
                # The expensive ingest already completed. A stale ORM instance or
                # duplicate task must not overwrite that truthful state with failed.
                result_payload = {
                    "task_id": task_id,
                    "document_id": completed_document.id,
                    "chunk_count": completed_document.chunk_count,
                    "status": "success",
                    "recovered_from": exc.__class__.__name__,
                }
                if original_task is not None:
                    task_repository.mark_task_success(db, task=original_task, result_payload=result_payload)
                return result_payload

            task = task_repository.get_task_by_id(db, task_id)
            if task is not None:
                task_repository.mark_task_failed(db, task=task, error_message=f"{exc.__class__.__name__}: {exc}")
            if document_id:
                knowledge_repository.update_document_status(
                    db,
                    document_id=document_id,
                    status=KnowledgeDocumentStatus.failed,
                )
                document = knowledge_repository.get_document(db, document_id)
                if document is not None and document.file_asset_id is not None:
                    from app.models.enums import FileParseStatus
                    file_repository.update_parse_status(
                        db,
                        file_id=document.file_asset_id,
                        parse_status=FileParseStatus.failed,
                        parse_error=str(exc) or exc.__class__.__name__,
                    )
        finally:
            pass
        raise
    finally:
        db.close()


@celery_app.task(name="app.tasks.knowledge_tasks.reindex_knowledge_collection_task")
def reindex_knowledge_collection_task(
    *, dry_run: bool = False, document_ids: list[int] | None = None,
    course_id: int | None = None, batch_size: int = 20,
    resume_from: int | None = None, target_collection: str | None = None,
) -> dict:
    """Build and verify a versioned collection; switch only after every selected document succeeds."""
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    settings = get_settings()
    target = target_collection or settings.chroma_active_collection
    if target == settings.chroma_legacy_collection:
        raise ValueError("target_collection must not be the legacy collection")
    db = SessionLocal()
    succeeded: list[dict] = []
    failed: list[dict] = []
    try:
        documents = knowledge_repository.list_documents_for_reindex(
            db, document_ids=document_ids, course_id=course_id, resume_from=resume_from,
        )
        if dry_run:
            return {"dry_run": True, "target_collection": target, "document_ids": [item.id for item in documents]}
        bounded_batch = max(1, min(batch_size, 100))
        for offset in range(0, len(documents), bounded_batch):
            for document in documents[offset: offset + bounded_batch]:
                try:
                    file_asset = file_repository.get_by_id(db, document.file_asset_id)
                    if file_asset is None:
                        raise RuntimeError("source file asset not found")
                    _parsed, chunks = index_document(
                        document=document, file_asset=file_asset, target_collection=target,
                    )
                    stored = count_by_document_id(
                        owner_id=document.owner_id, document_id=document.id, collection_name=target,
                    )
                    if stored != len(chunks):
                        raise RuntimeError(f"integrity check failed: expected {len(chunks)} chunks, found {stored}")
                    succeeded.append({"document_id": document.id, "chunk_count": stored})
                except Exception as exc:
                    logger.exception("Knowledge reindex failed document_id=%s", document.id)
                    failed.append({"document_id": document.id, "error": f"{type(exc).__name__}: {exc}"})
        switched = False
        if not failed:
            indexed_counts = {item["document_id"]: item["chunk_count"] for item in succeeded}
            all_documents = knowledge_repository.list_documents_for_reindex(db)
            for existing in all_documents:
                expected = indexed_counts.get(existing.id, int(getattr(existing, "chunk_count", 0)))
                actual = count_by_document_id(
                    owner_id=existing.owner_id, document_id=existing.id, collection_name=target,
                )
                if expected <= 0 or actual != expected:
                    failed.append({
                        "document_id": existing.id,
                        "error": f"CollectionIntegrityError: expected {expected} chunks, found {actual}",
                    })
            # Empty explicit selections are valid only when the repository itself has no documents.
            if not failed and (all_documents or document_ids == []):
                switch_active_collection(target)
                switched = True
        return {
            "dry_run": False, "target_collection": target, "succeeded": succeeded,
            "failed": failed, "switched": switched,
            "resume_from": failed[0]["document_id"] if failed else None,
        }
    finally:
        db.close()
