from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_active_user
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.enums import TaskStatus, UserRole
from app.models.task import GenerationTask
from app.models.user import User
from app.repositories.task_repository import task_repository
from app.schemas.common import ApiResponse
from app.schemas.task import TaskDetail, TaskListResponse, TaskOut, TaskStatusValue, TaskTypeValue
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.tasks.events import snapshot_event, task_channel
from app.utils.response import success_response

router = APIRouter()


def _task_out(task: GenerationTask) -> TaskOut:
    return TaskOut(
        id=task.id,
        task_type=task.task_type,
        status=task.status,
        progress=task.progress,
        result_artifact_id=task.result_artifact_id,
        error_message=task.error_message,
        current_stage=task.current_stage,
        status_message=task.status_message,
        partial_content=task.partial_content,
        result_payload=task.result_payload or {},
        started_at=task.started_at,
        finished_at=task.finished_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _safe_input_payload(payload: dict[str, Any]) -> dict[str, Any]:
    safe = dict(payload or {})
    raw_payload = safe.get("payload")
    if isinstance(raw_payload, dict):
        safe["payload"] = {
            key: _truncate_value(value)
            for key, value in raw_payload.items()
            if key not in {"reference_context"}
        }
    return safe


def _truncate_value(value: Any) -> Any:
    if isinstance(value, str) and len(value) > 1000:
        return value[:1000] + "...[truncated]"
    if isinstance(value, list):
        return [_truncate_value(item) for item in value[:50]]
    if isinstance(value, dict):
        return {key: _truncate_value(item) for key, item in list(value.items())[:50]}
    return value


@router.get(
    "",
    response_model=ApiResponse[TaskListResponse],
    summary="List current user's generation tasks",
)
def list_tasks(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    status: TaskStatusValue | None = Query(default=None),
    task_type: TaskTypeValue | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    items, total = task_repository.list_tasks(
        db,
        owner_id=current_user.id,
        page=page,
        page_size=page_size,
        status=status,
        task_type=task_type,
    )
    return success_response(
        data=TaskListResponse(
            items=[_task_out(item) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        ),
        request=request,
    )


@router.get(
    "/{task_id}",
    response_model=ApiResponse[TaskDetail],
    summary="Get generation task detail",
)
def get_task(
    task_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    task = task_repository.get_task_by_id(db, task_id)
    if task is None:
        raise NotFoundException("Task not found")
    if current_user.role != UserRole.admin and task.owner_id != current_user.id:
        raise ForbiddenException("No permission to access this task")
    data = TaskDetail(
        **_task_out(task).model_dump(),
        input_payload=_safe_input_payload(task.input_payload or {}),
    )
    return success_response(data=data, request=request)


def _ndjson(event: dict[str, Any]) -> bytes:
    return (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8")


async def _stream_task_events(task_id: int, initial: GenerationTask, request: Request) -> AsyncIterator[bytes]:
    yield _ndjson(snapshot_event(initial))
    if initial.status in {TaskStatus.success, TaskStatus.failed}:
        event_type = "done" if initial.status == TaskStatus.success else "error"
        yield _ndjson({"type": event_type, "task_id": task_id, "progress": initial.progress, "result_payload": initial.result_payload or {}, "error": initial.error_message})
        return

    pubsub = None
    try:
        if get_settings().redis_url:
            import redis.asyncio as async_redis
            client = async_redis.Redis.from_url(get_settings().redis_url, decode_responses=True, socket_timeout=2)
            pubsub = client.pubsub()
            await pubsub.subscribe(task_channel(task_id))
    except Exception:
        pubsub = None

    last_content = initial.partial_content or ""
    last_signature: tuple[Any, ...] | None = None
    try:
        while not await request.is_disconnected():
            if pubsub is not None:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.75)
                if message and message.get("data"):
                    yield (str(message["data"]) + "\n").encode("utf-8")
            else:
                await asyncio.sleep(0.75)
            if SessionLocal is None:
                continue
            db = SessionLocal()
            try:
                task = task_repository.get_task_by_id(db, task_id)
                if task is None:
                    yield _ndjson({"type": "error", "task_id": task_id, "error": "Task not found"})
                    return
                content = task.partial_content or ""
                signature = (task.status, task.progress, task.current_stage, task.status_message, len(content), task.error_message)
                if signature != last_signature:
                    if content.startswith(last_content) and len(content) > len(last_content):
                        yield _ndjson({"type": "delta", "task_id": task_id, "text": content[len(last_content):], "snapshot": True})
                    yield _ndjson(snapshot_event(task))
                    last_content, last_signature = content, signature
                if task.status in {TaskStatus.success, TaskStatus.failed}:
                    event_type = "done" if task.status == TaskStatus.success else "error"
                    yield _ndjson({"type": event_type, "task_id": task_id, "progress": task.progress, "result_payload": task.result_payload or {}, "error": task.error_message})
                    return
            finally:
                db.close()
    finally:
        if pubsub is not None:
            await pubsub.unsubscribe(task_channel(task_id))
            await pubsub.close()


@router.get("/{task_id}/stream", summary="Stream task events as NDJSON")
async def stream_task(task_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_active_user)):
    task = task_repository.get_task_by_id(db, task_id)
    if task is None:
        raise NotFoundException("Task not found")
    if current_user.role != UserRole.admin and task.owner_id != current_user.id:
        raise ForbiddenException("No permission to access this task")
    return StreamingResponse(_stream_task_events(task_id, task, request), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
