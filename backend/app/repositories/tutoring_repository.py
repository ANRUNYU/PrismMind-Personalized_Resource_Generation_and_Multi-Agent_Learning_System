from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.tutoring import TutoringConversation, TutoringMessage, TutoringSession


class TutoringRepository:
    def create_conversation(self, db: Session, *, user_id: int, course_id: int | None, title: str) -> TutoringConversation:
        item = TutoringConversation(user_id=user_id, course_id=course_id, title=title)
        db.add(item); db.commit(); db.refresh(item); return item

    def get_conversation(self, db: Session, conversation_id: int) -> TutoringConversation | None:
        return db.get(TutoringConversation, conversation_id)

    def list_conversations(self, db: Session, *, user_id: int) -> list[TutoringConversation]:
        return list(db.scalars(select(TutoringConversation).where(TutoringConversation.user_id == user_id).order_by(TutoringConversation.updated_at.desc(), TutoringConversation.id.desc())))

    def list_messages(self, db: Session, *, conversation_id: int, limit: int | None = None) -> list[TutoringMessage]:
        stmt = select(TutoringMessage).where(TutoringMessage.conversation_id == conversation_id).order_by(TutoringMessage.id)
        items = list(db.scalars(stmt))
        return items[-limit:] if limit else items

    def get_message_by_client_key(self, db: Session, *, conversation_id: int, client_message_id: str) -> TutoringMessage | None:
        return db.scalar(select(TutoringMessage).where(TutoringMessage.conversation_id == conversation_id, TutoringMessage.client_message_id == client_message_id))

    def create_message(self, db: Session, *, conversation_id: int, role: str, content: str, status: str = "completed", references=None, warnings=None, error=None, client_message_id=None) -> TutoringMessage:
        item = TutoringMessage(conversation_id=conversation_id, role=role, content=content, status=status, references=references or [], warnings=warnings or [], error=error, client_message_id=client_message_id)
        db.add(item); db.commit(); db.refresh(item); return item

    def update_message(self, db: Session, message: TutoringMessage, *, content: str | None = None, status: str | None = None, references=None, warnings=None, error: str | None = None) -> TutoringMessage:
        if content is not None: message.content = content
        if status is not None: message.status = status
        if references is not None: message.references = references
        if warnings is not None: message.warnings = warnings
        message.error = error
        db.add(message); db.commit(); db.refresh(message); return message
    def create_session(
        self,
        db: Session,
        *,
        user_id: int,
        course_id: int | None,
        topic: str | None,
        session_type: str,
        user_question: str,
        ai_response: str,
        response_format: str,
        context_refs: list[dict[str, Any]] | None = None,
    ) -> TutoringSession:
        session = TutoringSession(
            user_id=user_id,
            course_id=course_id,
            topic=topic,
            session_type=session_type,
            user_question=user_question,
            ai_response=ai_response,
            response_format=response_format,
            context_refs=context_refs or [],
            is_helpful=None,
            user_rating=None,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def get_by_id(self, db: Session, session_id: int) -> TutoringSession | None:
        return db.get(TutoringSession, session_id)

    def list_by_user(
        self,
        db: Session,
        *,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        topic: str | None = None,
        session_type: str | None = None,
    ) -> tuple[list[TutoringSession], int]:
        stmt = select(TutoringSession).where(TutoringSession.user_id == user_id)
        count_stmt = select(func.count()).select_from(TutoringSession).where(TutoringSession.user_id == user_id)
        if topic:
            pattern = f"%{topic}%"
            stmt = stmt.where(TutoringSession.topic.ilike(pattern))
            count_stmt = count_stmt.where(TutoringSession.topic.ilike(pattern))
        if session_type:
            stmt = stmt.where(TutoringSession.session_type == session_type)
            count_stmt = count_stmt.where(TutoringSession.session_type == session_type)

        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(TutoringSession.created_at.desc(), TutoringSession.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_all(
        self,
        db: Session,
        *,
        page: int = 1,
        page_size: int = 20,
        topic: str | None = None,
        session_type: str | None = None,
        user_id: int | None = None,
    ) -> tuple[list[TutoringSession], int]:
        stmt = select(TutoringSession)
        count_stmt = select(func.count()).select_from(TutoringSession)
        filters = []
        if user_id is not None:
            filters.append(TutoringSession.user_id == user_id)
        if topic:
            filters.append(TutoringSession.topic.ilike(f"%{topic}%"))
        if session_type:
            filters.append(TutoringSession.session_type == session_type)
        if filters:
            stmt = stmt.where(*filters)
            count_stmt = count_stmt.where(*filters)

        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(TutoringSession.created_at.desc(), TutoringSession.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def update_rating(
        self,
        db: Session,
        *,
        session: TutoringSession,
        is_helpful: bool,
        user_rating: int,
    ) -> TutoringSession:
        session.is_helpful = is_helpful
        session.user_rating = float(user_rating)
        db.add(session)
        db.commit()
        db.refresh(session)
        return session


tutoring_repository = TutoringRepository()
