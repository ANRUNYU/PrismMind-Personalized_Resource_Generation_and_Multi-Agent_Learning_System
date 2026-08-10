from __future__ import annotations

import asyncio
import logging

from app.db.session import SessionLocal
from app.repositories.task_repository import task_repository
from app.services.tasks.events import TaskEventEmitter
from app.services.generation.teacher_generation_service import teacher_generation_service
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.generation_tasks.run_teacher_generation_task")
def run_teacher_generation_task(task_id: int) -> dict:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")

    db = SessionLocal()
    try:
        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise RuntimeError(f"Generation task {task_id} not found")

        emitter = TaskEventEmitter(db, task)
        emitter.stage("validating")
        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise RuntimeError(f"Generation task {task_id} disappeared")

        result = asyncio.run(teacher_generation_service.stream_teacher_artifact_for_task(
            db,
            owner_id=task.owner_id,
            task_type=task.task_type,
            payload_data=task.input_payload.get("payload", {}),
            emitter=emitter,
        ))
        task = task_repository.get_task_by_id(db, task_id)
        if task is None:
            raise RuntimeError(f"Generation task {task_id} disappeared before success update")

        emitter.done({"artifact_id": result.artifact.id}, result_artifact_id=result.artifact.id)
        return {"task_id": task_id, "artifact_id": result.artifact.id, "status": "success"}
    except Exception as exc:
        logger.exception("Teacher generation task failed: %s", task_id)
        try:
            task = task_repository.get_task_by_id(db, task_id)
            if task is not None:
                TaskEventEmitter(db, task).error(exc)
        finally:
            pass
        raise
    finally:
        db.close()
