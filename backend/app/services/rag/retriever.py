from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.services.rag.chroma_store import query as query_chroma
from app.services.rag.chroma_store import resolve_active_collection


def retrieve(
    *,
    query: str,
    owner_id: int,
    course_id: int | None = None,
    document_id: int | None = None,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    settings = get_settings()
    return query_chroma(
        query_text=query,
        owner_id=owner_id,
        course_id=course_id,
        document_id=document_id,
        top_k=top_k,
        collection_name=resolve_active_collection(),
    )
