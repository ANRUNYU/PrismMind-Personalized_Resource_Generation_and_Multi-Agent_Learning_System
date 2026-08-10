from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import TaskStatus
from app.models.task import GenerationTask


class TaskRepository:
    def create_task(
        self,
        db: Session,
        *,
        owner_id: int,
        task_type: str,
        input_payload: dict[str, Any],
    ) -> GenerationTask:
        task = GenerationTask(
            owner_id=owner_id,
            task_type=task_type,
            status=TaskStatus.pending,
            progress=0,
            input_payload=input_payload,
            result_payload={},
            current_stage="queued",
            status_message="任务已排队",
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def get_task_by_id(self, db: Session, task_id: int) -> GenerationTask | None:
        return db.get(GenerationTask, task_id)

    def list_tasks(
        self,
        db: Session,
        *,
        owner_id: int,
        page: int = 1,
        page_size: int = 10,
        status: str | None = None,
        task_type: str | None = None,
    ) -> tuple[list[GenerationTask], int]:
        stmt = select(GenerationTask).where(GenerationTask.owner_id == owner_id)
        count_stmt = select(func.count()).select_from(GenerationTask).where(GenerationTask.owner_id == owner_id)
        if status:
            stmt = stmt.where(GenerationTask.status == TaskStatus(status))
            count_stmt = count_stmt.where(GenerationTask.status == TaskStatus(status))
        if task_type:
            stmt = stmt.where(GenerationTask.task_type == task_type)
            count_stmt = count_stmt.where(GenerationTask.task_type == task_type)
        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(GenerationTask.created_at.desc(), GenerationTask.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def update_task_status(
        self,
        db: Session,
        *,
        task: GenerationTask,
        status: TaskStatus | str,
        progress: int | None = None,
        error_message: str | None = None,
        current_stage: str | None = None,
        status_message: str | None = None,
        partial_content: str | None = None,
        result_payload: dict[str, Any] | None = None,
    ) -> GenerationTask:
        task.status = TaskStatus(status)
        if task.status == TaskStatus.running and task.started_at is None:
            task.started_at = datetime.now(timezone.utc)
        if progress is not None:
            task.progress = self._clamp_progress(progress)
        if error_message is not None:
            task.error_message = self._short_error(error_message)
        if current_stage is not None:
            task.current_stage = current_stage
        if status_message is not None:
            task.status_message = status_message[:500]
        if partial_content is not None:
            task.partial_content = partial_content
        if result_payload is not None:
            task.result_payload = result_payload
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def mark_task_success(
        self,
        db: Session,
        *,
        task: GenerationTask,
        result_artifact_id: int | None = None,
        result_payload: dict[str, Any] | None = None,
    ) -> GenerationTask:
        task.status = TaskStatus.success
        task.progress = 100
        task.result_artifact_id = result_artifact_id
        task.error_message = None
        task.current_stage = "completed"
        task.status_message = "任务已完成"
        task.finished_at = datetime.now(timezone.utc)
        if result_payload is not None:
            task.result_payload = result_payload
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def mark_task_failed(
        self,
        db: Session,
        *,
        task: GenerationTask,
        error_message: str,
    ) -> GenerationTask:
        task.status = TaskStatus.failed
        task.error_message = self._short_error(error_message)
        task.status_message = self._short_error(error_message)[:500]
        task.finished_at = datetime.now(timezone.utc)
        db.add(task)
        db.commit()
        db.refresh(task)
        return task

    def _clamp_progress(self, value: int) -> int:
        return max(0, min(100, int(value)))

    def _short_error(self, message: str) -> str:
        return str(message)[:1000]


task_repository = TaskRepository()
