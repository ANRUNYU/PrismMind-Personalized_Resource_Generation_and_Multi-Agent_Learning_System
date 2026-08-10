from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models.course import Course
from app.models.enums import KnowledgeDocumentStatus, UserRole
from app.models.knowledge import KnowledgeDocument
from app.models.user import User
from app.repositories.course_repository import course_repository
from app.services.embeddings.base import EmbeddingProvider, get_embedding_provider
from app.services.knowledge.models import (
    EvidenceChunk, EvidencePack, EvidenceSource, EvidenceStatus, GroundingPolicy,
)
from app.services.knowledge.cache import KnowledgeCache
from app.services.rag.chroma_store import query as query_chroma
from app.services.rag.chroma_store import resolve_active_collection
from app.services.rag.reranker import DashScopeReranker

logger = logging.getLogger(__name__)


class KnowledgeAccessError(PermissionError):
    pass


class KnowledgeService:
    def __init__(self, db: Session, *, settings: Settings | None = None,
                 embedding_provider: EmbeddingProvider | None = None, reranker: Any | None = None) -> None:
        self.db = db
        self.settings = settings or get_settings()
        self.embedding_provider = embedding_provider or get_embedding_provider()
        self.reranker = reranker or DashScopeReranker(self.settings)
        self.cache = KnowledgeCache(self.settings)

    def retrieve_for_agent(self, agent_role: str, user: User, course_id: int | None, query: str,
                           document_ids: list[int] | None = None, top_k: int = 5,
                           policy: GroundingPolicy = GroundingPolicy.STRICT) -> EvidencePack:
        started = time.perf_counter()
        documents = self._authorized_documents(user=user, course_id=course_id, document_ids=document_ids)
        cache_key = self.cache.key({
            "role": agent_role, "user_id": user.id, "course_id": course_id, "query": query,
            "document_ids": sorted(document_ids or []), "top_k": top_k, "policy": policy.value,
            "collection": resolve_active_collection(), "model": self.embedding_provider.model,
            "top_threshold": self.settings.rag_min_top_similarity,
            "mean_threshold": self.settings.rag_min_mean_similarity,
            "minimum_chunks": self.settings.rag_min_accepted_chunks,
        })
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached
        warnings: list[str] = []
        if not self._is_calibrated():
            warnings.append("RAG thresholds are using conservative uncalibrated defaults")
        if not documents:
            return self._empty_pack(query, policy, "没有可访问且已入库的知识文档", warnings, started)

        embedding_started = time.perf_counter()
        query_embedding = self.embedding_provider.embed_query(query)
        embedding_ms = (time.perf_counter() - embedding_started) * 1000

        candidate_k = max(top_k, self.settings.rag_candidate_k)
        candidates: list[dict[str, Any]] = []
        by_owner_course: dict[tuple[int, int | None], list[KnowledgeDocument]] = defaultdict(list)
        for document in documents:
            by_owner_course[(document.owner_id, document.course_id)].append(document)
        retrieval_started = time.perf_counter()
        for (owner_id, grouped_course_id), grouped in by_owner_course.items():
            selected_ids = {document.id for document in grouped}
            if document_ids:
                for document in grouped:
                    candidates.extend(query_chroma(
                        query_text=query, query_embedding=query_embedding, owner_id=owner_id,
                        course_id=grouped_course_id, document_id=document.id, top_k=candidate_k,
                        collection_name=resolve_active_collection(),
                    ))
            else:
                candidates.extend(result for result in query_chroma(
                    query_text=query, query_embedding=query_embedding, owner_id=owner_id,
                    course_id=grouped_course_id, top_k=candidate_k,
                    collection_name=resolve_active_collection(),
                ) if int((result.get("metadata") or {}).get("document_id", 0)) in selected_ids)
        retrieval_ms = (time.perf_counter() - retrieval_started) * 1000
        candidates.sort(key=lambda item: item.get("similarity") if item.get("similarity") is not None else -1, reverse=True)
        candidates = candidates[:candidate_k]
        candidate_count = len(candidates)

        rerank_ms = 0.0
        rerank_scores: dict[int, float] = {}
        if self.settings.rag_rerank_enabled and candidates:
            rerank_started = time.perf_counter()
            try:
                ranked = self.reranker.rerank(query=query, documents=[item["content"] for item in candidates], top_n=min(top_k, self.settings.rag_final_k))
                rerank_scores = {item.index: item.score for item in ranked}
                reranked = []
                for item in ranked:
                    if 0 <= item.index < len(candidates):
                        candidate = dict(candidates[item.index])
                        candidate["rerank_score"] = item.score
                        reranked.append(candidate)
                candidates = reranked
            except Exception as exc:
                warnings.append(f"Rerank unavailable; embedding order used ({type(exc).__name__})")
            rerank_ms = (time.perf_counter() - rerank_started) * 1000

        final_k = min(top_k, self.settings.rag_final_k)
        candidates = candidates[:final_k]
        similarities = [max(0.0, min(1.0, float(item.get("similarity") or 0.0))) for item in candidates]
        accepted_raw = [item for item, similarity in zip(candidates, similarities, strict=True) if similarity >= self.settings.rag_min_mean_similarity]
        top_similarity = max(similarities) if similarities else None
        mean_similarity = sum(similarities) / len(similarities) if similarities else None
        sufficient = bool(
            top_similarity is not None and top_similarity >= self.settings.rag_min_top_similarity
            and mean_similarity is not None and mean_similarity >= self.settings.rag_min_mean_similarity
            and len(accepted_raw) >= self.settings.rag_min_accepted_chunks
        )

        chunks: list[EvidenceChunk] = []
        sources: list[EvidenceSource] = []
        for position, item in enumerate(accepted_raw, 1):
            metadata = item.get("metadata") or {}
            heading_path = metadata.get("heading_path") or []
            if isinstance(heading_path, str):
                try: heading_path = json.loads(heading_path)
                except ValueError: heading_path = [heading_path] if heading_path else []
            citation_id = f"S{position}"
            chunk = EvidenceChunk(
                citation_id=citation_id, content=str(item.get("content") or ""),
                similarity=max(0.0, min(1.0, float(item.get("similarity") or 0.0))),
                rerank_score=item.get("rerank_score"), document_id=int(metadata["document_id"]),
                file_id=self._optional_int(metadata.get("file_id")), source_filename=str(metadata.get("source_filename") or ""),
                page_number=self._positive_int(metadata.get("page_number")), slide_number=self._positive_int(metadata.get("slide_number")),
                sheet_name=str(metadata.get("sheet_name") or "") or None, heading_path=list(heading_path),
                chunk_index=int(metadata.get("chunk_index", 0)),
            )
            chunks.append(chunk)
            sources.append(EvidenceSource(
                **chunk.model_dump(exclude={"content", "rerank_score", "chunk_index"}),
                excerpt=chunk.content[:500],
            ))

        status = EvidenceStatus.sufficient if sufficient else EvidenceStatus.insufficient
        reason = None if sufficient else self._insufficient_reason(top_similarity, mean_similarity, len(chunks))
        pack = EvidencePack(
            query=query, status=status, policy=policy, chunks=chunks if sufficient or policy != GroundingPolicy.STRICT else [],
            sources=sources if sufficient or policy != GroundingPolicy.STRICT else [], candidate_count=candidate_count,
            accepted_count=len(chunks), top_similarity=top_similarity, mean_similarity=mean_similarity,
            retrieval_model=self.embedding_provider.model,
            rerank_model=self.settings.rerank_model if self.settings.rag_rerank_enabled else None,
            warnings=warnings, insufficient_reason=reason, calibrated=self._is_calibrated(),
            retrieval_latency_ms=round((time.perf_counter() - started) * 1000, 2),
            embedding_latency_ms=round(embedding_ms, 2), rerank_latency_ms=round(rerank_ms, 2),
            similarity_distribution=[round(value, 6) for value in similarities],
        )
        logger.info(
            "knowledge_retrieval role=%s user_id=%s course_id=%s candidates=%s accepted=%s latency_ms=%.2f embedding_ms=%.2f rerank_ms=%.2f",
            agent_role, user.id, course_id, pack.candidate_count, pack.accepted_count,
            pack.retrieval_latency_ms, pack.embedding_latency_ms, pack.rerank_latency_ms,
        )
        self.cache.set(cache_key, pack)
        return pack

    def _authorized_documents(self, *, user: User, course_id: int | None, document_ids: list[int] | None) -> list[KnowledgeDocument]:
        course: Course | None = None
        if course_id is not None:
            course = self.db.get(Course, course_id)
            if course is None:
                raise KnowledgeAccessError("课程不存在或无权访问")
            membership = course_repository.get_active_membership(self.db, course_id, user.id)
            if user.role != UserRole.admin and course.owner_id != user.id and membership is None:
                raise KnowledgeAccessError("用户未加入该课程")
        stmt = select(KnowledgeDocument).where(KnowledgeDocument.status == KnowledgeDocumentStatus.ingested)
        if document_ids is not None:
            stmt = stmt.where(KnowledgeDocument.id.in_(list(dict.fromkeys(document_ids))))
        elif course_id is not None:
            stmt = stmt.where(KnowledgeDocument.course_id == course_id)
        else:
            stmt = stmt.where(KnowledgeDocument.owner_id == user.id, KnowledgeDocument.course_id.is_(None))
        documents = list(self.db.scalars(stmt))
        if document_ids is not None and len({item.id for item in documents}) != len(set(document_ids)):
            raise KnowledgeAccessError("一个或多个知识文档不存在、未入库或无权访问")
        for document in documents:
            if document.course_id is None:
                if user.role != UserRole.admin and document.owner_id != user.id:
                    raise KnowledgeAccessError("禁止访问其他用户的私人资料")
            else:
                if course_id is None or document.course_id != course_id:
                    raise KnowledgeAccessError("课程文档必须通过已授权课程访问")
        return documents

    def _is_calibrated(self) -> bool:
        return bool(self.settings.rag_threshold_calibration_file and Path(self.settings.rag_threshold_calibration_file).is_file())

    def _empty_pack(self, query, policy, reason, warnings, started) -> EvidencePack:
        return EvidencePack(query=query, status=EvidenceStatus.unavailable, policy=policy,
                            retrieval_model=self.embedding_provider.model, warnings=warnings,
                            insufficient_reason=reason, calibrated=self._is_calibrated(),
                            retrieval_latency_ms=round((time.perf_counter() - started) * 1000, 2))

    def _insufficient_reason(self, top: float | None, mean: float | None, count: int) -> str:
        return (f"证据未达到门控阈值：top={top}, mean={mean}, accepted={count}; "
                f"required top>={self.settings.rag_min_top_similarity}, mean>={self.settings.rag_min_mean_similarity}, "
                f"accepted>={self.settings.rag_min_accepted_chunks}")

    @staticmethod
    def _positive_int(value: Any) -> int | None:
        parsed = int(value or 0)
        return parsed if parsed > 0 else None

    @staticmethod
    def _optional_int(value: Any) -> int | None:
        return int(value) if value not in (None, "") else None
