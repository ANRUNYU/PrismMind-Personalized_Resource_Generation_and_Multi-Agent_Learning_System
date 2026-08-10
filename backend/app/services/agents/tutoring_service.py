from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.models.enums import KnowledgeDocumentStatus, UserRole
from app.models.tutoring import TutoringSession
from app.models.user import User
from app.repositories.knowledge_repository import knowledge_repository
from app.repositories.tutoring_repository import tutoring_repository
from app.schemas.tutoring import TutoringAskRequest, TutoringExplainRequest, TutoringHintRequest, TutoringReference
from app.services.agents.tutor_agent import tutor_agent
from app.services.rag.chroma_store import ChromaStoreError
from app.services.rag.retriever import retrieve


GENERAL_KNOWLEDGE_DISCLOSURE = (
    "说明：当前知识库中没有与该问题相关的内容，"
    "以下回答由智能体基于通用知识生成，未引用当前知识库。"
)
NO_KNOWLEDGE_FILES_DISCLOSURE = (
    "说明：当前没有可用的知识库文件，"
    "以下回答由智能体基于通用知识生成，未引用知识库。"
)
KNOWLEDGE_RETRIEVAL_FAILED_MESSAGE = "知识库检索暂不可用，请稍后重试。"
RAG_STRONG_SIMILARITY = 0.68
QUERY_BOILERPLATE = (
    "请为我", "请你", "帮我", "给我", "这个知识点", "知识点", "分步复习方案",
    "复习方案", "学习方案", "制定", "讲一下", "解释一下", "什么是", "如何",
    "怎么", "有什么作用", "请", "一下", "相关", "内容",
)


@dataclass
class TutoringServiceResult:
    session: TutoringSession
    content: str
    references: list[TutoringReference] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    used_knowledge_base: bool = False


class TutoringService:
    def ask(
        self,
        db: Session,
        *,
        current_user: User,
        payload: TutoringAskRequest,
    ) -> TutoringServiceResult:
        context = self._build_reference_context(db, current_user=current_user, payload=payload, query=payload.question)
        blocked_message = self.blocked_message(context)
        if blocked_message:
            content = blocked_message
        else:
            generated = tutor_agent.answer_question(
                question=payload.question, reference_context=self.model_reference_context(context),
                difficulty=payload.difficulty, response_format=payload.response_format,
            ).content
            content = self.with_general_knowledge_disclosure(generated, context)
        session = tutoring_repository.create_session(
            db,
            user_id=current_user.id,
            course_id=payload.course_id,
            topic=self._topic(payload.question),
            session_type="ask",
            user_question=payload.question,
            ai_response=content,
            response_format=payload.response_format,
            context_refs=self._references_to_dicts(context.references),
        )
        return TutoringServiceResult(
            session=session,
            content=content,
            references=context.references,
            warnings=context.warnings,
            used_knowledge_base=context.used_knowledge_base,
        )

    def hint(
        self,
        db: Session,
        *,
        current_user: User,
        payload: TutoringHintRequest,
    ) -> TutoringServiceResult:
        context = self._build_reference_context(db, current_user=current_user, payload=payload, query=payload.question)
        blocked_message = self.blocked_message(context)
        if blocked_message:
            content = blocked_message
        else:
            generated = tutor_agent.generate_hint(
                question=payload.question, context=payload.context,
                reference_context=self.model_reference_context(context),
                difficulty=payload.difficulty, response_format=payload.response_format,
            ).content
            content = self.with_general_knowledge_disclosure(generated, context)
        session = tutoring_repository.create_session(
            db,
            user_id=current_user.id,
            course_id=payload.course_id,
            topic=self._topic(payload.question),
            session_type="hint",
            user_question=payload.question,
            ai_response=content,
            response_format=payload.response_format,
            context_refs=self._references_to_dicts(context.references),
        )
        return TutoringServiceResult(
            session=session,
            content=content,
            references=context.references,
            warnings=context.warnings,
            used_knowledge_base=context.used_knowledge_base,
        )

    def explain(
        self,
        db: Session,
        *,
        current_user: User,
        payload: TutoringExplainRequest,
    ) -> TutoringServiceResult:
        context = self._build_reference_context(db, current_user=current_user, payload=payload, query=payload.concept)
        blocked_message = self.blocked_message(context)
        if blocked_message:
            content = blocked_message
        else:
            generated = tutor_agent.explain_concept(
                concept=payload.concept, reference_context=self.model_reference_context(context),
                difficulty=payload.difficulty, response_format=payload.response_format,
            ).content
            content = self.with_general_knowledge_disclosure(generated, context)
        session = tutoring_repository.create_session(
            db,
            user_id=current_user.id,
            course_id=payload.course_id,
            topic=self._topic(payload.concept),
            session_type="explain",
            user_question=payload.concept,
            ai_response=content,
            response_format=payload.response_format,
            context_refs=self._references_to_dicts(context.references),
        )
        return TutoringServiceResult(
            session=session,
            content=content,
            references=context.references,
            warnings=context.warnings,
            used_knowledge_base=context.used_knowledge_base,
        )

    def _build_reference_context(
        self,
        db: Session,
        *,
        current_user: User,
        payload: TutoringAskRequest | TutoringHintRequest | TutoringExplainRequest,
        query: str,
    ):
        document_ids = self._unique_ints(payload.knowledge_document_ids)
        should_retrieve = bool(payload.use_knowledge_base or document_ids)
        references: list[TutoringReference] = []
        warnings: list[str] = []
        sections: list[str] = []
        candidate_results: list[dict[str, Any]] = []
        retrieval_failed = False

        if not should_retrieve:
            return _TutoringReferenceContext("", references, warnings, used_knowledge_base=False)

        if document_ids:
            documents = self._validate_documents(db, current_user=current_user, document_ids=document_ids)
        else:
            documents = knowledge_repository.list_ingested_documents_for_owner(
                db,
                owner_id=current_user.id,
                course_id=payload.course_id,
            )
        try:
            for document in documents:
                results = retrieve(
                    query=query,
                    owner_id=document.owner_id,
                    course_id=payload.course_id,
                    document_id=document.id,
                    top_k=payload.top_k,
                )
                candidate_results.extend(
                    self._relevant_results_for_document(results, document.id, query=query)
                )
        except ChromaStoreError as exc:
            warnings.append(f"知识库检索失败：{exc}")
            retrieval_failed = True

        candidate_results.sort(key=lambda item: float(item.get("similarity") or 0), reverse=True)
        self._append_results(
            candidate_results[:payload.top_k],
            sections=sections,
            references=references,
        )

        return _TutoringReferenceContext(
            "\n\n".join(sections).strip(),
            references,
            warnings,
            used_knowledge_base=True,
            retrieval_failed=retrieval_failed,
            available_document_count=len(documents),
        )

    def blocked_message(self, context: _TutoringReferenceContext) -> str | None:
        if context.retrieval_failed:
            return KNOWLEDGE_RETRIEVAL_FAILED_MESSAGE
        return None

    def general_knowledge_disclosure(self, context: _TutoringReferenceContext) -> str | None:
        if context.used_knowledge_base and not context.references and not context.retrieval_failed:
            if context.available_document_count == 0:
                return NO_KNOWLEDGE_FILES_DISCLOSURE
            return GENERAL_KNOWLEDGE_DISCLOSURE
        return None

    def model_reference_context(self, context: _TutoringReferenceContext) -> str:
        if self.general_knowledge_disclosure(context):
            return (
                "[系统状态] 当前知识库未检索到与问题相关的内容。"
                "请直接基于通用知识给出完整、具体的教学回答；不要拒绝回答，"
                "不要要求学生再次确认，不要声称引用了当前知识库，也不要重复本状态说明。"
                "可以使用稳定的通用知识，但不要编造具体教材页码、考试年份题号、课程来源或统计数据。"
            )
        return context.text

    def _relevant_results_for_document(
        self,
        results: list[dict[str, Any]],
        document_id: int,
        *,
        query: str,
    ) -> list[dict[str, Any]]:
        scoped_results = []
        for result in results:
            metadata = result.get("metadata") or {}
            if self._safe_int(metadata.get("document_id")) != document_id:
                continue
            scoped_results.append(result)
        relevant_results = self._relevant_results(scoped_results)
        return [
            result
            for result in relevant_results
            if float(result["similarity"]) >= RAG_STRONG_SIMILARITY
            or self._has_topic_overlap(query, result)
        ]

    def _has_topic_overlap(self, query: str, result: dict[str, Any]) -> bool:
        topic = str(query or "").lower()
        for phrase in QUERY_BOILERPLATE:
            topic = topic.replace(phrase, " ")
        topic_parts = re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]+", topic)

        metadata = result.get("metadata") or {}
        evidence = " ".join(
            [
                str(result.get("content") or ""),
                str(metadata.get("source_filename") or ""),
                str(metadata.get("document_title") or ""),
            ]
        ).lower()
        evidence_normalized = "".join(re.findall(r"[a-z0-9\u4e00-\u9fff]+", evidence))

        for part in topic_parts:
            if len(part) >= 2 and part in evidence_normalized:
                return True
            if re.fullmatch(r"[\u4e00-\u9fff]+", part) and len(part) >= 3:
                if any(part[index:index + 2] in evidence_normalized for index in range(len(part) - 1)):
                    return True
        return False

    def with_general_knowledge_disclosure(
        self,
        content: str,
        context: _TutoringReferenceContext,
    ) -> str:
        disclosure = self.general_knowledge_disclosure(context)
        normalized_content = str(content or "").strip()
        if not disclosure:
            return normalized_content
        return f"{disclosure}\n\n{normalized_content}" if normalized_content else disclosure

    def _relevant_results(self, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
        threshold = float(get_settings().rag_min_top_similarity)
        relevant: list[dict[str, Any]] = []
        for result in results:
            similarity = result.get("similarity")
            if similarity is None:
                similarity = result.get("score")
            try:
                numeric_similarity = float(similarity)
            except (TypeError, ValueError):
                continue
            if numeric_similarity < threshold:
                continue
            normalized = dict(result)
            normalized["similarity"] = numeric_similarity
            relevant.append(normalized)
        return relevant

    def _validate_documents(
        self,
        db: Session,
        *,
        current_user: User,
        document_ids: list[int],
    ):
        if not document_ids:
            return []

        documents, missing_ids, forbidden_ids = knowledge_repository.list_accessible_documents_by_ids(
            db,
            document_ids=document_ids,
            current_user=current_user,
        )
        if missing_ids:
            raise NotFoundException(f"知识库文档不存在：{missing_ids[0]}")
        if forbidden_ids:
            raise ForbiddenException(f"无权访问知识库文档 {forbidden_ids[0]}")
        for document in documents:
            if current_user.role != UserRole.admin and document.owner_id != current_user.id:
                raise ForbiddenException(f"无权访问知识库文档 {document.id}")
            if document.status != KnowledgeDocumentStatus.ingested:
                raise BadRequestException(
                    f"知识库文档 {document.id} 尚未入库，请先执行入库。"
                )
        return documents

    def _append_results(
        self,
        results: list[dict[str, Any]],
        *,
        sections: list[str],
        references: list[TutoringReference],
    ) -> None:
        for result in results:
            content = str(result.get("content") or "").strip()
            if not content:
                continue
            metadata = result.get("metadata") or {}
            document_id = self._safe_int(metadata.get("document_id"))
            chunk_index = self._safe_int(metadata.get("chunk_index"))
            source_filename = metadata.get("source_filename")
            score = result.get("similarity")
            label = f"[document {document_id or '-'} / chunk {chunk_index if chunk_index is not None else '-'}]"
            if source_filename:
                label = f"[{source_filename} / chunk {chunk_index if chunk_index is not None else '-'}]"
            excerpt = self._truncate(content, 1200)
            sections.append(f"{label}\n{excerpt}")
            references.append(
                TutoringReference(
                    document_id=document_id,
                    chunk_index=chunk_index,
                    source_filename=source_filename,
                    excerpt=self._truncate(excerpt, 500),
                    score=float(score) if score is not None else None,
                )
            )

    def _references_to_dicts(self, references: list[TutoringReference]) -> list[dict[str, Any]]:
        return [reference.model_dump(mode="json") for reference in references]

    def _topic(self, text: str) -> str:
        return text.strip()[:80]

    def _unique_ints(self, values: list[int] | None) -> list[int]:
        if not values:
            return []
        return list(dict.fromkeys(int(value) for value in values))

    def _safe_int(self, value: Any) -> int | None:
        if value in (None, ""):
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _truncate(self, text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        return text[: max(0, limit - 20)].rstrip() + "\n...[truncated]"


@dataclass
class _TutoringReferenceContext:
    text: str
    references: list[TutoringReference]
    warnings: list[str]
    used_knowledge_base: bool
    retrieval_failed: bool = False
    available_document_count: int = 0


tutoring_service = TutoringService()
