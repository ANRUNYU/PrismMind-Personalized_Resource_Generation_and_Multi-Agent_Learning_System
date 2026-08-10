from __future__ import annotations

from typing import Any

from datetime import UTC, datetime
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import LearningPathStatus
from app.models.learning_path import LearningPath, LearningPathStep


class LearningPathRepository:
    def create_path(
        self,
        db: Session,
        *,
        user_id: int,
        profile_id: int | None,
        title: str,
        path_steps: list[dict[str, Any]],
        milestones: list[dict[str, Any]],
        status: LearningPathStatus = LearningPathStatus.active,
        profile_snapshot: dict[str, Any] | None = None,
    ) -> LearningPath:
        path = LearningPath(
            user_id=user_id,
            profile_id=profile_id,
            title=title,
            path_steps=path_steps,
            current_step=0,
            completion_rate=0.0,
            milestones=milestones,
            status=status,
            profile_snapshot=profile_snapshot,
        )
        db.add(path)
        db.flush()
        self._materialize_steps(db, path)
        db.commit()
        db.refresh(path)
        return path

    def get_by_id(self, db: Session, path_id: int) -> LearningPath | None:
        path = db.get(LearningPath, path_id)
        if path is not None and not path.steps and path.path_steps:
            self._materialize_steps(db, path)
            db.commit(); db.refresh(path)
        return path

    def get_step(self, db: Session, *, path_id: int, step_id: int, for_update: bool = False) -> LearningPathStep | None:
        stmt = select(LearningPathStep).where(LearningPathStep.id == step_id, LearningPathStep.learning_path_id == path_id)
        if for_update: stmt = stmt.with_for_update()
        return db.scalar(stmt)

    def _materialize_steps(self, db: Session, path: LearningPath) -> None:
        now = datetime.now(UTC)
        for index, raw in enumerate(path.path_steps or []):
            points = raw.get("knowledge_points") or [raw.get("topic") or raw.get("title")]
            primary_point = raw.get("knowledge_point") or points[0]
            db.add(LearningPathStep(
                learning_path_id=path.id, position=index, title=str(raw.get("title") or f"步骤 {index + 1}"),
                knowledge_point=str(primary_point), description=self._step_description(raw),
                learning_objectives=[raw.get("objective")] if raw.get("objective") else [],
                estimated_minutes=int(raw.get("estimated_minutes") or 30),
                status="active" if index == 0 else "locked", pass_score=float(raw.get("pass_score") or 60),
                unlocked_at=now if index == 0 else None,
            ))

    @staticmethod
    def _step_description(raw: dict[str, Any]) -> str:
        parts = [str(raw.get("learning_activity") or raw.get("objective") or "").strip()]
        practice = str(raw.get("practice_task") or "").strip()
        criteria = str(raw.get("completion_criteria") or "").strip()
        if practice:
            parts.append(f"实践任务：{practice}")
        if criteria:
            parts.append(f"完成标准：{criteria}")
        return "\n\n".join(part for part in parts if part)

    def list_by_user(
        self,
        db: Session,
        *,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        status: LearningPathStatus | None = None,
        topic: str | None = None,
    ) -> tuple[list[LearningPath], int]:
        stmt = select(LearningPath).where(LearningPath.user_id == user_id)
        if status is not None:
            stmt = stmt.where(LearningPath.status == status)
        return self._list_filtered(db, stmt, page=page, page_size=page_size, topic=topic)

    def list_all(
        self,
        db: Session,
        *,
        page: int = 1,
        page_size: int = 20,
        status: LearningPathStatus | None = None,
        topic: str | None = None,
        user_id: int | None = None,
    ) -> tuple[list[LearningPath], int]:
        stmt = select(LearningPath)
        if user_id is not None:
            stmt = stmt.where(LearningPath.user_id == user_id)
        if status is not None:
            stmt = stmt.where(LearningPath.status == status)
        return self._list_filtered(db, stmt, page=page, page_size=page_size, topic=topic)

    def update_progress(
        self,
        db: Session,
        *,
        path: LearningPath,
        current_step: int,
        completion_rate: float,
        status: LearningPathStatus,
        path_steps: list[dict[str, Any]] | None = None,
        milestones: list[dict[str, Any]] | None = None,
    ) -> LearningPath:
        path.current_step = current_step
        path.completion_rate = completion_rate
        path.status = status
        if path_steps is not None:
            path.path_steps = path_steps
        if milestones is not None:
            path.milestones = milestones
        db.add(path)
        db.commit()
        db.refresh(path)
        return path

    def update_path_steps(
        self,
        db: Session,
        *,
        path: LearningPath,
        path_steps: list[dict[str, Any]],
        milestones: list[dict[str, Any]] | None = None,
    ) -> LearningPath:
        path.path_steps = path_steps
        if milestones is not None:
            path.milestones = milestones
        db.add(path)
        db.commit()
        db.refresh(path)
        return path

    def get_active_paths(self, db: Session, *, user_id: int) -> list[LearningPath]:
        stmt = (
            select(LearningPath)
            .where(LearningPath.user_id == user_id, LearningPath.status == LearningPathStatus.active)
            .order_by(LearningPath.created_at.desc(), LearningPath.id.desc())
        )
        return list(db.scalars(stmt))

    def _list_filtered(self, db: Session, stmt, *, page: int, page_size: int, topic: str | None) -> tuple[list[LearningPath], int]:
        items = list(db.scalars(stmt.order_by(LearningPath.created_at.desc(), LearningPath.id.desc())))
        if topic:
            keyword = topic.lower()
            items = [
                item
                for item in items
                if keyword in (item.title or "").lower()
                or any(keyword in str(step.get("topic", "")).lower() for step in item.path_steps or [])
            ]
        total = len(items)
        start = (page - 1) * page_size
        return items[start : start + page_size], total


learning_path_repository = LearningPathRepository()
