from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.assistant import AssistantMessage, AssistantSession


class AssistantRepository:
    def create_session(
        self,
        db: Session,
        *,
        user_id: int,
        title: str,
        mode: str,
        course_id: int | None,
    ) -> AssistantSession:
        session = AssistantSession(
            user_id=user_id,
            title=title,
            mode=mode,
            course_id=course_id,
            status="active",
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def get_session(self, db: Session, session_id: int) -> AssistantSession | None:
        return db.get(AssistantSession, session_id)

    def get_session_with_messages(self, db: Session, session_id: int) -> AssistantSession | None:
        stmt = (
            select(AssistantSession)
            .options(selectinload(AssistantSession.messages))
            .where(AssistantSession.id == session_id)
        )
        return db.scalar(stmt)

    def list_sessions(
        self,
        db: Session,
        *,
        user_id: int,
        course_id: int | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[AssistantSession], int]:
        stmt = select(AssistantSession).where(
            AssistantSession.user_id == user_id,
            AssistantSession.status == "active",
        )
        count_stmt = select(func.count()).select_from(AssistantSession).where(
            AssistantSession.user_id == user_id,
            AssistantSession.status == "active",
        )
        if course_id is not None:
            stmt = stmt.where(AssistantSession.course_id == course_id)
            count_stmt = count_stmt.where(AssistantSession.course_id == course_id)

        total = int(db.scalar(count_stmt) or 0)
        items = list(
            db.scalars(
                stmt.order_by(AssistantSession.updated_at.desc(), AssistantSession.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def count_messages(self, db: Session, session_id: int) -> int:
        stmt = select(func.count()).select_from(AssistantMessage).where(AssistantMessage.session_id == session_id)
        return int(db.scalar(stmt) or 0)

    def last_message(self, db: Session, session_id: int) -> AssistantMessage | None:
        stmt = (
            select(AssistantMessage)
            .where(AssistantMessage.session_id == session_id)
            .order_by(AssistantMessage.created_at.desc(), AssistantMessage.id.desc())
            .limit(1)
        )
        return db.scalar(stmt)

    def create_message(
        self,
        db: Session,
        *,
        session_id: int,
        role: str,
        content: str,
        references: list[dict] | None = None,
        attachment_file_ids: list[int] | None = None,
        status: str = "completed",
        completed_at: datetime | None = None,
    ) -> AssistantMessage:
        message = AssistantMessage(
            session_id=session_id,
            role=role,
            content=content,
            references=references or [],
            attachment_file_ids=attachment_file_ids or [],
            status=status,
            completed_at=completed_at or (datetime.now(timezone.utc) if status == "completed" else None),
        )
        db.add(message)
        session = db.get(AssistantSession, session_id)
        if session is not None:
            session.updated_at = datetime.now(timezone.utc)
            db.add(session)
        db.commit()
        db.refresh(message)
        return message

    def update_message(
        self,
        db: Session,
        message: AssistantMessage,
        *,
        content: str | None = None,
        status: str | None = None,
        references: list[dict] | None = None,
        error_message: str | None = None,
    ) -> AssistantMessage:
        if content is not None:
            message.content = content
        if status is not None:
            message.status = status
            if status in {"completed", "failed", "cancelled"}:
                message.completed_at = datetime.now(timezone.utc)
        if references is not None:
            message.references = references
        message.error_message = error_message
        db.add(message)
        db.commit()
        db.refresh(message)
        return message

    def recent_completed_messages(self, db: Session, session_id: int, limit: int = 12) -> list[AssistantMessage]:
        stmt = (
            select(AssistantMessage)
            .where(AssistantMessage.session_id == session_id, AssistantMessage.status == "completed")
            .order_by(AssistantMessage.created_at.desc(), AssistantMessage.id.desc())
            .limit(limit)
        )
        return list(reversed(list(db.scalars(stmt))))

    def update_session_title(self, db: Session, session: AssistantSession, title: str) -> AssistantSession:
        session.title = title
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def delete_session(self, db: Session, session: AssistantSession) -> None:
        db.delete(session)
        db.commit()


assistant_repository = AssistantRepository()
