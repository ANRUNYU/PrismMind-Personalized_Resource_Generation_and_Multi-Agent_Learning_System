from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.enums import FileParseStatus, KnowledgeDocumentStatus
from app.models.file_asset import FileAsset
from app.models.knowledge import KnowledgeDocument
from app.repositories.file_repository import file_repository
from app.repositories.knowledge_repository import knowledge_repository
from app.services.documents.parser import ParsedBlock, ParsedDocument, parse_document
from app.services.documents.storage import get_file_path
from app.services.embeddings.base import EmbeddingProvider, get_embedding_provider
from app.services.rag.chroma_store import ChromaChunk, delete_by_document_id, upsert_chunks


@dataclass(frozen=True)
class StructuredChunk:
    content: str
    metadata: dict
    chroma_id: str


def split_text(text: str, *, chunk_size: int = 800, chunk_overlap: int = 120) -> list[str]:
    """Deprecated compatibility helper for callers without ParsedDocument metadata."""
    block = ParsedBlock(text=text, char_start=0, char_end=len(text))
    return [content for content, _start, _end in _split_block(block, chunk_size=chunk_size, chunk_overlap=chunk_overlap)]


def _split_block(block: ParsedBlock, *, chunk_size: int, chunk_overlap: int) -> list[tuple[str, int, int]]:
    text = block.text.strip()
    if not text:
        return []
    overlap = min(max(0, chunk_overlap), max(0, chunk_size // 5))
    parts = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        content = text[start:end].strip()
        if content:
            parts.append((content, block.char_start + start, block.char_start + end))
        if end >= len(text):
            break
        start = end - overlap
    return parts


def build_structured_chunks(*, parsed: ParsedDocument, document: KnowledgeDocument, file_asset: FileAsset,
                            chunk_size: int, chunk_overlap: int, collection_version: str,
                            embedding_model: str, embedding_dimension: int) -> list[StructuredChunk]:
    chunks: list[StructuredChunk] = []
    for block in parsed.blocks:
        for content, char_start, char_end in _split_block(block, chunk_size=chunk_size, chunk_overlap=chunk_overlap):
            index = len(chunks)
            content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
            chroma_id = f"doc_{document.id}_chunk_{index}"
            metadata = {
                "owner_id": int(document.owner_id),
                "course_id": int(document.course_id) if document.course_id is not None else 0,
                "document_id": int(document.id),
                "file_id": int(file_asset.id),
                "source_filename": file_asset.original_filename,
                "page_number": block.page_number or 0,
                "slide_number": block.slide_number or 0,
                "sheet_name": block.sheet_name or "",
                "heading_path": json.dumps(block.heading_path, ensure_ascii=False),
                "block_type": block.block_type,
                "char_start": char_start,
                "char_end": char_end,
                "chunk_index": index,
                "content_hash": content_hash,
                "embedding_model": embedding_model,
                "embedding_dimension": int(embedding_dimension),
                "collection_version": collection_version,
            }
            chunks.append(StructuredChunk(content=content, metadata=metadata, chroma_id=chroma_id))
    return chunks


def index_document(*, document: KnowledgeDocument, file_asset: FileAsset, target_collection: str,
                   embedding_provider: EmbeddingProvider | None = None, chunk_size: int = 800,
                   chunk_overlap: int = 120) -> tuple[ParsedDocument, list[StructuredChunk]]:
    settings = get_settings()
    provider = embedding_provider or get_embedding_provider()
    parsed = parse_document(get_file_path(file_asset.storage_path), Path(file_asset.original_filename).suffix)
    chunks = build_structured_chunks(
        parsed=parsed, document=document, file_asset=file_asset, chunk_size=chunk_size,
        chunk_overlap=chunk_overlap, collection_version=settings.chroma_collection_version,
        embedding_model=provider.model, embedding_dimension=provider.dimension,
    )
    if not chunks:
        raise ValueError("Parsed document produced no chunks")
    embeddings = provider.embed_documents([chunk.content for chunk in chunks])
    if len(embeddings) != len(chunks):
        raise ValueError("Embedding provider returned an invalid vector count")
    delete_by_document_id(owner_id=document.owner_id, document_id=document.id, collection_name=target_collection)
    upsert_chunks(chunks=[
        ChromaChunk(chroma_id=chunk.chroma_id, content=chunk.content, metadata=chunk.metadata, embedding=embedding)
        for chunk, embedding in zip(chunks, embeddings, strict=True)
    ], collection_name=target_collection)
    return parsed, chunks


def ingest_document(db: Session, *, document: KnowledgeDocument, file_asset: FileAsset,
                    chunk_size: int = 800, chunk_overlap: int = 120,
                    target_collection: str | None = None,
                    embedding_provider: EmbeddingProvider | None = None) -> int:
    settings = get_settings()
    collection = target_collection or settings.chroma_active_collection
    # Keep primitive identifiers before the first commit. SQLAlchemy expires ORM
    # instances on commit; a concurrent retry/deduplication may otherwise turn a
    # stale instance access into ObjectDeletedError after the chunks were saved.
    document_id = int(document.id)
    course_id = int(document.course_id) if document.course_id is not None else None
    file_id = int(file_asset.id)
    knowledge_repository.update_document_status(db, document_id=document_id, status=KnowledgeDocumentStatus.parsing)
    try:
        file_repository.update_parse_status(db, file_id=file_id, parse_status=FileParseStatus.parsing)
        parsed, chunks = index_document(
            document=document, file_asset=file_asset, target_collection=collection,
            embedding_provider=embedding_provider, chunk_size=chunk_size, chunk_overlap=chunk_overlap,
        )
        knowledge_repository.delete_chunks_by_document(db, document_id)
        knowledge_repository.create_chunks(
            db, document_id=document_id, course_id=course_id,
            chunks=[{"chunk_index": i, "content": chunk.content, "metadata": chunk.metadata, "chroma_id": chunk.chroma_id}
                    for i, chunk in enumerate(chunks)],
            chroma_collection=collection,
        )
        knowledge_repository.update_document_status(
            db, document_id=document_id, status=KnowledgeDocumentStatus.ingested, chunk_count=len(chunks),
        )
        file_repository.update_parse_status(
            db, file_id=file_id, parse_status=FileParseStatus.parsed,
            parsed_text_char_count=len(parsed.text),
        )
        return len(chunks)
    except Exception as exc:
        rollback = getattr(db, "rollback", None)
        if callable(rollback):
            rollback()
        try:
            completed_document = knowledge_repository.get_document(db, document_id)
        except (AttributeError, TypeError):
            completed_document = None
        if (
            completed_document is not None
            and completed_document.status == KnowledgeDocumentStatus.ingested
            and completed_document.chunk_count > 0
        ):
            # A concurrent task may have completed the same document while this
            # worker held an expired ORM instance. Preserve the verified result.
            return int(completed_document.chunk_count)
        knowledge_repository.update_document_status(db, document_id=document_id, status=KnowledgeDocumentStatus.failed)
        file_repository.update_parse_status(
            db, file_id=file_id, parse_status=FileParseStatus.failed,
            parse_error=str(exc) or exc.__class__.__name__,
        )
        raise


def clone_ingested_document(
    db: Session,
    *,
    source_document: KnowledgeDocument,
    target_document: KnowledgeDocument,
    target_file_asset: FileAsset,
    embedding_provider: EmbeddingProvider | None = None,
) -> int:
    """Clone ready chunks into a private document without parsing the same file again."""
    source_chunks = knowledge_repository.list_chunks_by_document(db, source_document.id)
    if source_document.status != KnowledgeDocumentStatus.ingested or not source_chunks:
        raise ValueError("Course knowledge document is not ready")
    provider = embedding_provider or get_embedding_provider()
    contents = [chunk.content for chunk in source_chunks]
    embeddings = provider.embed_documents(contents)
    if len(embeddings) != len(source_chunks):
        raise ValueError("Embedding provider returned an invalid vector count")
    collection = get_settings().chroma_active_collection
    cloned_chunks: list[StructuredChunk] = []
    for index, source_chunk in enumerate(source_chunks):
        metadata = dict(source_chunk.metadata_ or {})
        metadata.update(
            {
                "owner_id": int(target_document.owner_id),
                "course_id": 0,
                "document_id": int(target_document.id),
                "file_id": int(target_file_asset.id),
                "source_filename": target_file_asset.original_filename,
                "chunk_index": index,
                "copied_from_course_document_id": int(source_document.id),
                "embedding_model": provider.model,
                "embedding_dimension": int(provider.dimension),
            }
        )
        cloned_chunks.append(
            StructuredChunk(
                content=source_chunk.content,
                metadata=metadata,
                chroma_id=f"doc_{target_document.id}_chunk_{index}",
            )
        )
    try:
        upsert_chunks(
            chunks=[
                ChromaChunk(
                    chroma_id=chunk.chroma_id,
                    content=chunk.content,
                    metadata=chunk.metadata,
                    embedding=embedding,
                )
                for chunk, embedding in zip(cloned_chunks, embeddings, strict=True)
            ],
            collection_name=collection,
        )
        knowledge_repository.create_chunks(
            db,
            document_id=target_document.id,
            course_id=None,
            chunks=[
                {
                    "chunk_index": index,
                    "content": chunk.content,
                    "metadata": chunk.metadata,
                    "chroma_id": chunk.chroma_id,
                }
                for index, chunk in enumerate(cloned_chunks)
            ],
            chroma_collection=collection,
        )
        knowledge_repository.update_document_status(
            db,
            document_id=target_document.id,
            status=KnowledgeDocumentStatus.ingested,
            chunk_count=len(cloned_chunks),
        )
        file_repository.update_parse_status(
            db,
            file_id=target_file_asset.id,
            parse_status=FileParseStatus.parsed,
            parsed_text_char_count=sum(len(item) for item in contents),
        )
        return len(cloned_chunks)
    except Exception:
        delete_by_document_id(
            owner_id=target_document.owner_id,
            document_id=target_document.id,
            collection_name=collection,
        )
        knowledge_repository.update_document_status(
            db,
            document_id=target_document.id,
            status=KnowledgeDocumentStatus.failed,
        )
        raise
