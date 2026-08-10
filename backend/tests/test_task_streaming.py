from __future__ import annotations

from app.models.enums import TaskStatus
from app.models.task import GenerationTask
from app.repositories.task_repository import task_repository
from app.services.tasks import events
from app.tasks.resource_tasks import _question_preview


class FakeDb:
    def add(self, value):
        pass
    def commit(self):
        pass
    def refresh(self, value):
        pass


def make_task() -> GenerationTask:
    task = GenerationTask(owner_id=1, task_type="student_resource_generation", input_payload={"payload": {"topic": "AI"}})
    task.id = 12
    task.status = TaskStatus.pending
    task.progress = 0
    task.result_payload = {}
    task.partial_content = None
    task.error_message = None
    task.started_at = None
    task.finished_at = None
    return task


def test_result_payload_does_not_modify_input_payload():
    task = make_task()
    original = dict(task.input_payload)
    task_repository.mark_task_success(FakeDb(), task=task, result_payload={"resource_ids": [7, 8]})
    assert task.result_payload == {"resource_ids": [7, 8]}
    assert task.input_payload == original
    assert "result_summary" not in task.input_payload


def test_streaming_task_state_transitions_and_buffered_snapshot(monkeypatch):
    task = make_task()
    published = []
    monkeypatch.setattr(events, "publish_task_event", published.append)
    emitter = events.TaskEventEmitter(FakeDb(), task, flush_chars=5)
    emitter.stage("generating")
    emitter.delta("abc")
    assert task.partial_content is None
    emitter.delta("def")
    assert task.partial_content == "abcdef"
    emitter.done({"artifact_id": 9}, result_artifact_id=9)
    assert task.status == TaskStatus.success
    assert task.current_stage == "completed"
    assert task.result_payload == {"artifact_id": 9}
    assert [event["type"] for event in published] == ["stage", "delta", "delta", "done"]


def test_snapshot_contains_reconnect_content_without_synthetic_delta():
    task = make_task()
    task.status = TaskStatus.running
    task.current_stage = "generating"
    task.progress = 61
    task.partial_content = "已持久化的局部内容"
    event = events.snapshot_event(task)
    assert event["type"] == "meta"
    assert event["snapshot"] is True
    assert event["text"] == "已持久化的局部内容"


def test_replace_content_resets_rejected_stream_draft(monkeypatch):
    task = make_task()
    published = []
    monkeypatch.setattr(events, "publish_task_event", published.append)
    emitter = events.TaskEventEmitter(FakeDb(), task, flush_chars=1)
    emitter.stage("generating")
    emitter.delta("不完整草稿")

    emitter.replace_content("", message="题量不足，重新生成")
    emitter.delta("完整试卷")

    assert task.partial_content == "完整试卷"
    replacement = next(event for event in published if event["type"] == "meta")
    assert replacement["snapshot"] is True
    assert replacement["text"] == ""
    assert replacement["message"] == "题量不足，重新生成"


def test_student_test_stream_preview_is_readable_markdown():
    preview = _question_preview(
        "机房技术",
        [{
            "question_type": "single_choice",
            "stem": "UPS 的主要作用是什么？",
            "options": [{"key": "A", "text": "提供不间断供电"}],
        }],
    )
    assert preview.startswith("# 机房技术测验")
    assert "## 1. 单选题" in preview
    assert "- A. 提供不间断供电" in preview
