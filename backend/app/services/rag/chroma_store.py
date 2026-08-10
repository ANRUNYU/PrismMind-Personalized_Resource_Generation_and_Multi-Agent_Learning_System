from __future__ import annotations

from dataclasses import dataclass
import json
from threading import Lock
from typing import Any

from app.core.config import get_settings
from app.services.embeddings.base import EmbeddingProvider, get_embedding_provider


class ChromaStoreError(RuntimeError):
    pass


_CHROMA_CLIENT: Any | None = None
_CHROMA_CLIENT_PATH: str | None = None
_CHROMA_CLIENT_LOCK = Lock()


@dataclass(frozen=True)
class ChromaChunk:
    chroma_id: str
    content: str
    metadata: dict[str, Any]
    embedding: list[float]


def _import_chromadb():
    try:
        import chromadb
    except ImportError as exc:
        raise ChromaStoreError("chromadb is not installed; install backend requirements first") from exc
    return chromadb


def _clear_chroma_system_cache() -> None:
    try:
        from chromadb.api.shared_system_client import SharedSystemClient
        SharedSystemClient.clear_system_cache()
    except Exception:
        return


def get_chroma_client():
    settings = get_settings()
    persist_path = settings.chroma_persist_path
    persist_path.mkdir(parents=True, exist_ok=True)
    path = str(persist_path)
    global _CHROMA_CLIENT, _CHROMA_CLIENT_PATH
    with _CHROMA_CLIENT_LOCK:
        if _CHROMA_CLIENT is not None and _CHROMA_CLIENT_PATH == path:
            return _CHROMA_CLIENT
        if _CHROMA_CLIENT_PATH is not None and _CHROMA_CLIENT_PATH != path:
            _clear_chroma_system_cache()
        try:
            _CHROMA_CLIENT = _import_chromadb().PersistentClient(path=path)
            _CHROMA_CLIENT_PATH = path
            return _CHROMA_CLIENT
        except Exception as exc:
            _CHROMA_CLIENT = None
            _CHROMA_CLIENT_PATH = None
            raise ChromaStoreError(f"Failed to open Chroma client: {path}") from exc


def get_or_create_collection(name: str | None = None):
    settings = get_settings()
    collection_name = name or resolve_active_collection()
    if collection_name == settings.chroma_legacy_collection and name is None:
        raise ChromaStoreError("Legacy collection must never be selected implicitly")
    try:
        # embedding_function=None prevents Chroma from silently selecting its default embedder.
        return get_chroma_client().get_or_create_collection(
            name=collection_name, embedding_function=None, metadata={"hnsw:space": "cosine"},
        )
    except Exception as exc:
        raise ChromaStoreError(f"Failed to open Chroma collection: {collection_name}") from exc


def resolve_active_collection() -> str:
    settings = get_settings()
    state_path = settings.chroma_persist_path / "active_collection.json"
    if state_path.exists():
        try:
            value = json.loads(state_path.read_text(encoding="utf-8")).get("active_collection")
            if value:
                return str(value)
        except (OSError, ValueError, TypeError):
            pass
    return settings.chroma_active_collection


def switch_active_collection(collection_name: str) -> None:
    settings = get_settings()
    if collection_name == settings.chroma_legacy_collection:
        raise ChromaStoreError("Reindex cannot switch the active collection back to the legacy collection")
    state_path = settings.chroma_persist_path / "active_collection.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = state_path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"active_collection": collection_name}), encoding="utf-8")
    temporary.replace(state_path)


def _build_where(*, owner_id: int, course_id: int | None = None, document_id: int | None = None) -> dict[str, Any]:
    filters: list[dict[str, Any]] = [{"owner_id": int(owner_id)}]
    if course_id is not None:
        filters.append({"course_id": int(course_id)})
    if document_id is not None:
        filters.append({"document_id": int(document_id)})
    return filters[0] if len(filters) == 1 else {"$and": filters}


def upsert_chunks(*, chunks: list[ChromaChunk], collection_name: str | None = None) -> None:
    if not chunks:
        return
    try:
        get_or_create_collection(collection_name).upsert(
            ids=[chunk.chroma_id for chunk in chunks],
            documents=[chunk.content for chunk in chunks],
            metadatas=[chunk.metadata for chunk in chunks],
            embeddings=[chunk.embedding for chunk in chunks],
        )
    except Exception as exc:
        raise ChromaStoreError("Failed to upsert chunks to Chroma") from exc


# Backwards-compatible name; implementation is idempotent upsert.
add_chunks = upsert_chunks


def delete_by_document_id(*, owner_id: int, document_id: int, collection_name: str | None = None) -> None:
    try:
        get_or_create_collection(collection_name).delete(where=_build_where(owner_id=owner_id, document_id=document_id))
    except Exception as exc:
        raise ChromaStoreError("Failed to delete document chunks from Chroma") from exc


def count_by_document_id(*, owner_id: int, document_id: int, collection_name: str) -> int:
    raw = get_or_create_collection(collection_name).get(
        where=_build_where(owner_id=owner_id, document_id=document_id), include=[]
    )
    return len(raw.get("ids") or [])


def query(*, query_text: str, owner_id: int, course_id: int | None = None, document_id: int | None = None,
          top_k: int = 5, collection_name: str | None = None,
          embedding_provider: EmbeddingProvider | None = None,
          query_embedding: list[float] | None = None) -> list[dict[str, Any]]:
    provider = embedding_provider or get_embedding_provider()
    query_embedding = query_embedding or provider.embed_query(query_text)
    try:
        raw = get_or_create_collection(collection_name).query(
            query_embeddings=[query_embedding], n_results=top_k,
            where=_build_where(owner_id=owner_id, course_id=course_id, document_id=document_id),
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:
        raise ChromaStoreError("Failed to query Chroma") from exc
    documents = (raw.get("documents") or [[]])[0] or []
    metadatas = (raw.get("metadatas") or [[]])[0] or []
    distances = (raw.get("distances") or [[]])[0] or []
    results = []
    for index, document in enumerate(documents):
        distance = float(distances[index]) if index < len(distances) and distances[index] is not None else None
        results.append({
            "content": document,
            "metadata": metadatas[index] if index < len(metadatas) else {},
            "distance": distance,
            "similarity": 1.0 - distance if distance is not None else None,
        })
    return results
