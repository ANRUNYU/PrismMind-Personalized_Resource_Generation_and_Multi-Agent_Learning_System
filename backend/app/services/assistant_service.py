from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.models.assistant import AssistantMessage, AssistantSession
from app.models.course import Course
from app.models.enums import FileParseStatus, KnowledgeDocumentStatus
from app.models.file_asset import FileAsset
from app.models.knowledge import KnowledgeDocument
from app.models.user import User
from app.repositories.assistant_repository import assistant_repository
from app.repositories.file_repository import file_repository
from app.repositories.knowledge_repository import knowledge_repository
from app.schemas.assistant import (
    AssistantAnswerStyle,
    AssistantDeleteResponse,
    AssistantFileUploadResponse,
    AssistantMessageRead,
    AssistantReference,
    AssistantSendMessageRequest,
    AssistantSendMessageResponse,
    AssistantSessionCreate,
    AssistantSessionDetail,
    AssistantSessionListResponse,
    AssistantSessionSummary,
    AssistantUsedDocument,
)
from app.services.course_service import course_service
from app.services.documents.parser import DocumentParseError, parse_document
from app.services.documents.storage import delete_file as delete_stored_file
from app.services.documents.storage import get_file_path, save_upload_file
from app.services.llm.provider import llm_provider
from app.services.rag.chroma_store import ChromaStoreError
from app.services.rag.retriever import retrieve


def _clean_excerpt(text: str, max_length: int = 260) -> str:
    normalized = " ".join((text or "").split())
    if len(normalized) <= max_length:
        return normalized
    return normalized[: max_length - 1].rstrip() + "..."


def _title_from_message(message: str) -> str:
    normalized = " ".join(message.split())
    if not normalized:
        return "智能助手会话"
    return normalized[:48]


@dataclass
class AssistantStreamContext:
    session: AssistantSession
    user_message: AssistantMessage
    assistant_message: AssistantMessage
    prompt: str
    fallback: str
    references: list[AssistantReference]
    warnings: list[str]


class AssistantService:
    system_prompt = (
        "你是棱镜智教-PrismMind 的课程知识库问答助手。请使用中文回答，优先依据给定资料，"
        "不要输出内部 ID，不要编造资料来源；资料不足时明确说明不确定性。"
    )
    def list_sessions(
        self,
        db: Session,
        *,
        current_user: User,
        course_id: int | None,
        page: int,
        page_size: int,
    ) -> AssistantSessionListResponse:
        if course_id is not None:
            course = course_service.get_course_or_404(db, course_id)
            self._assert_can_view_course(db, course, current_user)
        items, total = assistant_repository.list_sessions(
            db,
            user_id=current_user.id,
            course_id=course_id,
            page=page,
            page_size=page_size,
        )
        return AssistantSessionListResponse(
            items=[self._session_summary(db, item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def create_session(
        self,
        db: Session,
        *,
        payload: AssistantSessionCreate,
        current_user: User,
    ) -> AssistantSessionDetail:
        if payload.course_id is not None:
            course = course_service.get_course_or_404(db, payload.course_id)
            self._assert_can_view_course(db, course, current_user)
        session = assistant_repository.create_session(
            db,
            user_id=current_user.id,
            title=payload.title or "智能助手会话",
            mode=payload.mode,
            course_id=payload.course_id,
        )
        return self._session_detail(db, session)

    def get_session_detail(
        self,
        db: Session,
        *,
        session_id: int,
        current_user: User,
    ) -> AssistantSessionDetail:
        session = self._get_owned_session(db, session_id=session_id, current_user=current_user, with_messages=True)
        return self._session_detail(db, session)

    def delete_session(
        self,
        db: Session,
        *,
        session_id: int,
        current_user: User,
    ) -> AssistantDeleteResponse:
        session = self._get_owned_session(db, session_id=session_id, current_user=current_user, with_messages=False)
        assistant_repository.delete_session(db, session)
        return AssistantDeleteResponse(session_id=session_id, deleted=True)

    async def upload_attachment(
        self,
        db: Session,
        *,
        upload_file: UploadFile,
        current_user: User,
    ) -> AssistantFileUploadResponse:
        from app.api.v1.files import _validate_upload

        _validate_upload(upload_file)
        settings = get_settings()
        try:
            stored_file = await save_upload_file(upload_file, max_size_bytes=settings.max_upload_size_bytes)
        except ValueError as exc:
            raise BadRequestException(str(exc)) from exc

        if stored_file.file_size <= 0:
            delete_stored_file(stored_file.storage_path)
            raise BadRequestException("上传文件不能为空")

        try:
            file_asset = file_repository.create_file_asset(
                db,
                owner_id=current_user.id,
                original_filename=stored_file.original_filename,
                storage_path=stored_file.storage_path,
                content_type=stored_file.content_type,
                file_size=stored_file.file_size,
                file_hash=stored_file.file_hash,
                asset_type="assistant_attachment",
                parse_status=FileParseStatus.pending,
            )
        except Exception:
            delete_stored_file(stored_file.storage_path)
            raise
        return AssistantFileUploadResponse.model_validate(file_asset)

    def send_message(
        self,
        db: Session,
        *,
        session_id: int,
        payload: AssistantSendMessageRequest,
        current_user: User,
    ) -> AssistantSendMessageResponse:
        session = self._get_owned_session(db, session_id=session_id, current_user=current_user, with_messages=False)
        course_id = payload.course_id or session.course_id
        course = None
        if course_id is not None:
            course = course_service.get_course_or_404(db, course_id)
            self._assert_can_view_course(db, course, current_user)
            if session.course_id is None:
                session.course_id = course_id
                db.add(session)
                db.commit()
                db.refresh(session)

        attachment_files = self._load_attachment_files(db, payload.attachment_file_ids, current_user)
        references: list[AssistantReference] = []
        warnings: list[str] = []

        if payload.use_course_knowledge and course is not None:
            course_references, course_warnings = self._retrieve_course_context(
                db,
                course=course,
                current_user=current_user,
                question=payload.message,
                document_ids=payload.knowledge_document_ids,
                top_k=payload.top_k,
            )
            references.extend(course_references)
            warnings.extend(course_warnings)

        file_references, file_warnings = self._extract_file_context(attachment_files)
        references.extend(file_references)
        warnings.extend(file_warnings)

        answer = self._compose_answer(
            question=payload.message,
            style=payload.answer_style,
            course=course,
            references=references,
            warnings=warnings,
        )
        followups = self._suggest_followups(course=course, has_references=bool(references), has_files=bool(attachment_files))

        if assistant_repository.count_messages(db, session.id) == 0 and session.title == "智能助手会话":
            session = assistant_repository.update_session_title(db, session, _title_from_message(payload.message))

        user_message = assistant_repository.create_message(
            db,
            session_id=session.id,
            role="user",
            content=payload.message,
            attachment_file_ids=[file_asset.id for file_asset in attachment_files],
        )
        assistant_message = assistant_repository.create_message(
            db,
            session_id=session.id,
            role="assistant",
            content=answer,
            references=[reference.model_dump() for reference in references],
        )
        refreshed_session = assistant_repository.get_session(db, session.id) or session
        return AssistantSendMessageResponse(
            session=self._session_summary(db, refreshed_session),
            user_message=self._message_read(user_message),
            assistant_message=self._message_read(assistant_message),
            answer=answer,
            references=references,
            used_documents=self._used_documents(references),
            suggested_followups=followups,
            warnings=warnings,
        )

    def prepare_stream(
        self,
        db: Session,
        *,
        session_id: int,
        payload: AssistantSendMessageRequest,
        current_user: User,
    ) -> AssistantStreamContext:
        session = self._get_owned_session(db, session_id=session_id, current_user=current_user, with_messages=False)
        course_id = payload.course_id or session.course_id
        course = None
        if course_id is not None:
            course = course_service.get_course_or_404(db, course_id)
            self._assert_can_view_course(db, course, current_user)
            if session.course_id is None:
                session.course_id = course_id
                db.add(session)
                db.commit()
                db.refresh(session)

        attachment_files = self._load_attachment_files(db, payload.attachment_file_ids, current_user)
        references: list[AssistantReference] = []
        warnings: list[str] = []
        if payload.use_course_knowledge and course is not None:
            found, retrieval_warnings = self._retrieve_course_context(
                db, course=course, current_user=current_user, question=payload.message,
                document_ids=payload.knowledge_document_ids, top_k=payload.top_k,
            )
            references.extend(found)
            warnings.extend(retrieval_warnings)
        file_references, file_warnings = self._extract_file_context(attachment_files)
        references.extend(file_references)
        warnings.extend(file_warnings)

        history = assistant_repository.recent_completed_messages(db, session.id, limit=12)
        if not history and assistant_repository.count_messages(db, session.id) == 0:
            session = assistant_repository.update_session_title(db, session, _title_from_message(payload.message))
        user_message = assistant_repository.create_message(
            db, session_id=session.id, role="user", content=payload.message,
            attachment_file_ids=[item.id for item in attachment_files],
        )
        assistant_message = assistant_repository.create_message(
            db, session_id=session.id, role="assistant", content="", status="running",
        )
        fallback = self._compose_rule_answer(
            question=payload.message, style=payload.answer_style, course=course,
            references=references, warnings=warnings,
        )
        prompt = self._assistant_prompt(
            question=payload.message, style=payload.answer_style, course=course,
            references=references, warnings=warnings, history=history,
        )
        return AssistantStreamContext(session, user_message, assistant_message, prompt, fallback, references, warnings)

    def finish_stream_message(self, db: Session, message_id: int, *, content: str, references: list[AssistantReference]) -> AssistantMessage:
        message = db.get(AssistantMessage, message_id)
        if message is None:
            raise NotFoundException("助手消息不存在")
        if message.status in {"completed", "cancelled"}:
            return message
        return assistant_repository.update_message(
            db, message, content=content, status="completed",
            references=[item.model_dump(mode="json") for item in references],
        )

    def fail_stream_message(self, db: Session, message_id: int, *, content: str, error: str, cancelled: bool = False) -> AssistantMessage | None:
        message = db.get(AssistantMessage, message_id)
        if message is None or message.status == "completed":
            return message
        return assistant_repository.update_message(
            db, message, content=content, status="cancelled" if cancelled else "failed", error_message=error,
        )

    def cancel_message(self, db: Session, *, message_id: int, current_user: User) -> AssistantMessageRead:
        message = db.get(AssistantMessage, message_id)
        if message is None:
            raise NotFoundException("助手消息不存在")
        self._get_owned_session(db, session_id=message.session_id, current_user=current_user, with_messages=False)
        if message.status == "running":
            message = assistant_repository.update_message(db, message, status="cancelled", error_message="用户已停止生成")
        return self._message_read(message)

    def _get_owned_session(
        self,
        db: Session,
        *,
        session_id: int,
        current_user: User,
        with_messages: bool,
    ) -> AssistantSession:
        session = (
            assistant_repository.get_session_with_messages(db, session_id)
            if with_messages
            else assistant_repository.get_session(db, session_id)
        )
        if session is None:
            raise NotFoundException("助手会话不存在")
        if session.user_id != current_user.id:
            raise ForbiddenException("无权访问该助手会话")
        return session

    def _assert_can_view_course(self, db: Session, course: Course, current_user: User) -> None:
        if not course_service.can_view_course(db, course, current_user):
            raise ForbiddenException("无权访问该课程")

    def _load_attachment_files(self, db: Session, file_ids: list[int], current_user: User) -> list[FileAsset]:
        files: list[FileAsset] = []
        for file_id in list(dict.fromkeys(file_ids)):
            file_asset = file_repository.get_by_id(db, file_id)
            if file_asset is None:
                raise NotFoundException("附件文件不存在")
            if not file_repository.check_owner_or_admin(file_asset, current_user):
                raise ForbiddenException("无权访问该附件")
            files.append(file_asset)
        return files

    def _retrieve_course_context(
        self,
        db: Session,
        *,
        course: Course,
        current_user: User,
        question: str,
        document_ids: list[int],
        top_k: int,
    ) -> tuple[list[AssistantReference], list[str]]:
        documents = self._course_documents(db, course_id=course.id, document_ids=document_ids)
        documents_by_id = {document.id: document for document in documents}
        references: list[AssistantReference] = []
        warnings: list[str] = []

        try:
            if documents:
                raw_results: list[dict[str, Any]] = []
                for document in documents:
                    raw_results.extend(
                        retrieve(
                            query=question,
                            owner_id=document.owner_id,
                            course_id=course.id,
                            document_id=document.id,
                            top_k=top_k,
                        )
                    )
            else:
                owner_id = int(course.owner_id or current_user.id)
                raw_results = retrieve(query=question, owner_id=owner_id, course_id=course.id, top_k=top_k)
                course_documents, _ = knowledge_repository.list_documents(
                    db,
                    include_all=True,
                    course_id=course.id,
                    page=1,
                    page_size=1000,
                )
                documents_by_id = {document.id: document for document in course_documents}
        except ChromaStoreError as exc:
            return [], [f"课程知识库检索暂不可用：{exc.__class__.__name__}"]

        raw_results = sorted(
            raw_results,
            key=lambda item: item.get("score") if item.get("score") is not None else float("inf"),
        )[:top_k]
        for result in raw_results:
            content = str(result.get("content") or "")
            if not content.strip():
                continue
            metadata = result.get("metadata") or {}
            document_id_raw = metadata.get("document_id")
            document_id = int(document_id_raw) if document_id_raw is not None else None
            document = documents_by_id.get(document_id) if document_id is not None else None
            file_asset = document.file_asset if document is not None else None
            references.append(
                AssistantReference(
                    source_type="course_knowledge",
                    title=document.title if document is not None else None,
                    filename=file_asset.original_filename if file_asset is not None else metadata.get("source_filename"),
                    excerpt=_clean_excerpt(content),
                    score=result.get("score"),
                    document_id=document_id,
                    chunk_index=metadata.get("chunk_index"),
                )
            )
        if not references:
            warnings.append("当前课程知识库没有检索到直接相关片段，回答将基于通用学习策略。")
        return references, warnings

    def _course_documents(self, db: Session, *, course_id: int, document_ids: list[int]) -> list[KnowledgeDocument]:
        documents: list[KnowledgeDocument] = []
        for document_id in list(dict.fromkeys(document_ids)):
            if document_id <= 0:
                raise BadRequestException("知识库文档 ID 必须为正整数")
            document = knowledge_repository.get_document(db, document_id)
            if document is None or document.course_id != course_id:
                raise BadRequestException("所选知识库文档必须属于当前课程")
            if document.status != KnowledgeDocumentStatus.ingested:
                raise BadRequestException("所选知识库文档尚未入库")
            documents.append(document)
        return documents

    def _extract_file_context(self, files: list[FileAsset]) -> tuple[list[AssistantReference], list[str]]:
        references: list[AssistantReference] = []
        warnings: list[str] = []
        for file_asset in files:
            path = get_file_path(file_asset.storage_path)
            try:
                content = parse_document(path, Path(file_asset.original_filename).suffix)
            except (DocumentParseError, FileNotFoundError, ValueError) as exc:
                warnings.append(f"{file_asset.original_filename} 暂无法解析：{exc.__class__.__name__}")
                continue
            references.append(
                AssistantReference(
                    source_type="file",
                    title=file_asset.original_filename,
                    filename=file_asset.original_filename,
                    excerpt=_clean_excerpt(content, max_length=500),
                    file_id=file_asset.id,
                )
            )
        return references, warnings

    def _compose_answer(
        self,
        *,
        question: str,
        style: AssistantAnswerStyle,
        course: Course | None,
        references: list[AssistantReference],
        warnings: list[str],
    ) -> str:
        fallback = self._compose_rule_answer(
            question=question,
            style=style,
            course=course,
            references=references,
            warnings=warnings,
        )
        result = llm_provider.generate_text(
            self._assistant_prompt(
                question=question,
                style=style,
                course=course,
                references=references,
                warnings=warnings,
            ),
            system_prompt=(
                "你是棱镜智教-PrismMind 的课程知识库问答助手。请使用中文回答，优先基于给定资料，"
                "不要输出内部 ID，不要编造资料来源；资料不足时必须说明“基于当前资料无法完全确定”。"
            ),
            temperature=0.25,
            fallback=fallback,
        )
        if result.used_fallback and result.error_message:
            warnings.append("真实模型暂不可用，已使用本地稳定模式生成回答。")
        return result.content

    def _assistant_prompt(
        self,
        *,
        question: str,
        style: AssistantAnswerStyle,
        course: Course | None,
        references: list[AssistantReference],
        warnings: list[str],
        history: list[AssistantMessage] | None = None,
    ) -> str:
        course_label = course.name if course is not None else "未绑定课程"
        history_block = "\n".join(
            f"{('用户' if item.role == 'user' else '助手')}：{item.content[:1200]}"
            for item in (history or [])
            if item.role in {"user", "assistant"} and item.content.strip()
        ) or "无历史会话"
        evidence_lines = []
        for index, reference in enumerate(references[:8], start=1):
            title = reference.title or reference.filename or f"资料片段 {index}"
            evidence_lines.append(f"{index}. 来源：{title}\n内容：{reference.excerpt}")
        evidence_block = "\n\n".join(evidence_lines) or "当前没有命中的课程知识库或附件片段。"
        warning_block = "；".join(warnings) if warnings else "无"
        return (
            f"最近会话历史：\n{history_block}\n\n"
            f"课程：{course_label}\n"
            f"回答风格：{style}\n"
            f"问题：{question}\n\n"
            f"可用依据：\n{evidence_block}\n\n"
            f"检索提示：{warning_block}\n\n"
            "请按以下 Markdown 结构输出：\n"
            "### 直接回答\n"
            "### 依据说明\n"
            "### 学习建议\n"
            "### 可继续追问\n\n"
            "要求：使用中文；不要显示 course_id、document_id、file_id 等内部 ID；"
            "如果依据不足，明确说明“基于当前资料无法完全确定”，再给出通用学习策略。"
        )

    def _compose_rule_answer(
        self,
        *,
        question: str,
        style: AssistantAnswerStyle,
        course: Course | None,
        references: list[AssistantReference],
        warnings: list[str],
    ) -> str:
        course_label = f"课程“{course.name}”" if course is not None else "当前学习任务"
        evidence_lines = [
            f"- {reference.title or reference.filename or '资料片段'}：{reference.excerpt}"
            for reference in references[:5]
        ]
        evidence_block = "\n".join(evidence_lines)
        if not evidence_block:
            evidence_block = "- 暂未命中课程知识库或附件中的直接证据。"

        if style == "concise":
            return (
                f"### 简要回答\n"
                f"围绕你的问题“{question}”，建议先明确目标概念，再结合{course_label}中的材料做验证。\n\n"
                f"### 依据\n{evidence_block}\n\n"
                f"### 提醒\n"
                f"{'；'.join(warnings) if warnings else '当前回答为规则式智能助手生成，可继续追问要求展开步骤。'}"
            )
        if style == "step_by_step":
            return (
                f"### 分步骤思路\n"
                f"1. 先定位问题核心：{question}\n"
                f"2. 再对照{course_label}的知识点或附件资料，找出定义、条件和例子。\n"
                f"3. 最后用自己的话复述，并补一个练习或课堂案例。\n\n"
                f"### 可用依据\n{evidence_block}\n\n"
                f"### 下一步\n如果你愿意，可以继续让我把这个问题改写成课堂讲解、练习题或学习计划。"
            )
        if style == "detailed":
            return (
                f"### 问题理解\n"
                f"你正在询问“{question}”。我会优先结合{course_label}和当前上传资料进行解释。\n\n"
                f"### 资料依据\n{evidence_block}\n\n"
                f"### 综合回答\n"
                f"从现有资料看，可以先把问题拆成“概念是什么、为什么重要、如何应用、如何检验掌握程度”四层。"
                f"若资料片段已经覆盖关键事实，应优先引用资料中的表述；若资料不足，则用通用学习策略补足解释，并在后续追问中补充课程文档。\n\n"
                f"### 学习建议\n"
                f"- 用一句话概括核心概念。\n"
                f"- 找一个与课程任务相关的小例子。\n"
                f"- 用 3 个检查题验证自己是否真的理解。\n\n"
                f"### 说明\n{'；'.join(warnings) if warnings else '本回答已尽量使用课程知识库或附件上下文。'}"
            )
        return (
            f"### 回答\n"
            f"针对“{question}”，我建议从{course_label}的目标出发，先抓住核心概念，再结合资料片段形成可执行的学习步骤。\n\n"
            f"### 参考依据\n{evidence_block}\n\n"
            f"### 建议行动\n"
            f"- 先用自己的话总结这个问题的关键词。\n"
            f"- 再查看课程资料中对应片段，确认定义和适用条件。\n"
            f"- 最后做一个小练习，检验是否能迁移应用。\n\n"
            f"### 备注\n{'；'.join(warnings) if warnings else '当前回答基于课程知识库、上传附件和通用学习策略综合生成。'}"
        )

    def _suggest_followups(self, *, course: Course | None, has_references: bool, has_files: bool) -> list[str]:
        if course is not None and has_references:
            return [
                "请把这部分整理成课堂讲解提纲",
                "请基于这些资料生成 3 道练习题",
                "请指出我应该优先复习哪些知识点",
            ]
        if has_files:
            return [
                "请总结附件的核心观点",
                "请根据附件生成复习清单",
                "请把附件内容改写成学生易懂的解释",
            ]
        return [
            "请给我一个更具体的例子",
            "请分步骤解释这个问题",
            "请推荐下一步学习任务",
        ]

    def _used_documents(self, references: list[AssistantReference]) -> list[AssistantUsedDocument]:
        seen: set[tuple[str, str | None, str | None]] = set()
        used: list[AssistantUsedDocument] = []
        for reference in references:
            key = (reference.source_type, reference.title, reference.filename)
            if key in seen:
                continue
            seen.add(key)
            used.append(
                AssistantUsedDocument(
                    source_type=reference.source_type,
                    title=reference.title,
                    filename=reference.filename,
                )
            )
        return used

    def _session_summary(self, db: Session, session: AssistantSession) -> AssistantSessionSummary:
        last_message = assistant_repository.last_message(db, session.id)
        return AssistantSessionSummary(
            id=session.id,
            user_id=session.user_id,
            course_id=session.course_id,
            title=session.title,
            mode=session.mode,
            status=session.status,
            last_message=_clean_excerpt(last_message.content, max_length=120) if last_message is not None else None,
            message_count=assistant_repository.count_messages(db, session.id),
            created_at=session.created_at,
            updated_at=session.updated_at,
        )

    def _session_detail(self, db: Session, session: AssistantSession) -> AssistantSessionDetail:
        messages = list(session.messages) if hasattr(session, "messages") else []
        if not messages:
            loaded = assistant_repository.get_session_with_messages(db, session.id)
            messages = list(loaded.messages) if loaded is not None else []
        summary = self._session_summary(db, session)
        return AssistantSessionDetail(
            **summary.model_dump(),
            messages=[self._message_read(message) for message in messages],
        )

    def _message_read(self, message: AssistantMessage) -> AssistantMessageRead:
        return AssistantMessageRead.model_validate(message)


assistant_service = AssistantService()
