from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from app.core.config import get_settings
from app.models.enums import TaskStatus
from app.models.task import GenerationTask
from app.repositories.task_repository import task_repository

logger = logging.getLogger(__name__)

TASK_STAGES: dict[str, tuple[int, str]] = {
    "queued": (0, "任务已排队"),
    "validating": (5, "正在校验输入"),
    "parsing_references": (15, "正在解析参考资料"),
    "retrieving": (30, "正在检索知识库"),
    "building_prompt": (40, "正在构建提示词"),
    "generating": (45, "正在生成内容"),
    "quality_analysis": (90, "正在执行质量分析"),
    "persisting": (96, "正在保存结果"),
    "completed": (100, "任务已完成"),
}


def task_channel(task_id: int) -> str:
    return f"prismmind:task:{task_id}:events"


def build_event(event_type: str, task_id: int, **payload: Any) -> dict[str, Any]:
    return {"type": event_type, "event_id": uuid4().hex, "task_id": task_id, **payload}


def publish_task_event(event: dict[str, Any]) -> None:
    redis_url = get_settings().redis_url
    if not redis_url:
        return
    try:
        import redis
        client = redis.Redis.from_url(redis_url, decode_responses=True, socket_timeout=1)
        client.publish(task_channel(int(event["task_id"])), json.dumps(event, ensure_ascii=False))
        client.close()
    except Exception as exc:  # Redis transport is optional; DB snapshot remains authoritative.
        logger.warning("task_event_publish_failed task_id=%s error=%s", event.get("task_id"), exc.__class__.__name__)


def snapshot_event(task: GenerationTask) -> dict[str, Any]:
    return build_event(
        "meta",
        task.id,
        stage=task.current_stage,
        progress=task.progress,
        message=task.status_message,
        text=task.partial_content or "",
        result_payload=task.result_payload or {},
        status=task.status.value,
        error=task.error_message,
        snapshot=True,
    )


@dataclass
class TaskEventEmitter:
    db: Any
    task: GenerationTask
    flush_chars: int = 200
    flush_interval_seconds: float = 0.25
    _content: str = ""
    _buffer: list[str] = field(default_factory=list)
    _last_flush: float = field(default_factory=time.monotonic)
    _chunk_count: int = 0

    def __post_init__(self) -> None:
        self._content = self.task.partial_content or ""

    def stage(self, stage: str, *, progress: int | None = None, message: str | None = None) -> None:
        default_progress, default_message = TASK_STAGES[stage]
        task_repository.update_task_status(
            self.db, task=self.task, status=TaskStatus.running,
            progress=default_progress if progress is None else progress,
            current_stage=stage, status_message=message or default_message,
        )
        publish_task_event(build_event("stage", self.task.id, stage=stage, progress=self.task.progress, message=self.task.status_message))

    def delta(self, text: str) -> None:
        if not text:
            return
        self._buffer.append(text)
        self._chunk_count += 1
        publish_task_event(build_event("delta", self.task.id, text=text))
        buffered_chars = sum(len(item) for item in self._buffer)
        if buffered_chars >= self.flush_chars or time.monotonic() - self._last_flush >= self.flush_interval_seconds:
            self.flush()

    def flush(self) -> None:
        if not self._buffer:
            return
        self._content += "".join(self._buffer)
        self._buffer.clear()
        self._last_flush = time.monotonic()
        progress = min(85, 45 + min(40, self._chunk_count))
        task_repository.update_task_status(
            self.db, task=self.task, status=TaskStatus.running, progress=progress,
            current_stage="generating", status_message="正在接收模型输出", partial_content=self._content,
        )

    def replace_content(self, text: str = "", *, message: str = "正在重新生成完整内容") -> None:
        """Replace a rejected draft before a corrective streaming pass."""
        self._buffer.clear()
        self._content = text
        self._chunk_count = 0
        self._last_flush = time.monotonic()
        task_repository.update_task_status(
            self.db,
            task=self.task,
            status=TaskStatus.running,
            progress=45,
            current_stage="generating",
            status_message=message,
            partial_content=text,
        )
        publish_task_event(build_event(
            "meta",
            self.task.id,
            stage="generating",
            progress=45,
            message=message,
            text=text,
            status=self.task.status.value,
            snapshot=True,
        ))

    def warning(self, message: str) -> None:
        publish_task_event(build_event("warning", self.task.id, message=message))

    def reference(self, reference: dict[str, Any]) -> None:
        publish_task_event(build_event("reference", self.task.id, reference=reference))

    def done(self, result_payload: dict[str, Any], result_artifact_id: int | None = None) -> None:
        self.flush()
        task_repository.mark_task_success(
            self.db, task=self.task, result_artifact_id=result_artifact_id, result_payload=result_payload,
        )
        publish_task_event(build_event("done", self.task.id, stage="completed", progress=100, message="任务已完成", result_payload=result_payload))

    def error(self, exc: Exception) -> None:
        message = str(exc).strip() or exc.__class__.__name__
        task_repository.mark_task_failed(self.db, task=self.task, error_message=message)
        publish_task_event(build_event("error", self.task.id, message=message, error=message))
