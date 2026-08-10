from __future__ import annotations

from types import SimpleNamespace

from app.models.enums import KnowledgeDocumentStatus
from app.tasks import knowledge_tasks


class FakeDb:
    def rollback(self):
        pass

    def close(self):
        pass


def test_ingest_task_preserves_verified_ready_document_after_stale_instance_error(monkeypatch):
    db = FakeDb()
    task = SimpleNamespace(
        id=7,
        task_type="knowledge_ingest",
        input_payload={"document_id": 11, "file_asset_id": 22, "course_id": 3},
    )
    initial_document = SimpleNamespace(id=11, file_asset_id=22)
    completed_document = SimpleNamespace(
        id=11,
        file_asset_id=22,
        status=KnowledgeDocumentStatus.ingested,
        chunk_count=26,
    )
    documents = iter([initial_document, completed_document])
    marked_success: list[dict] = []
    marked_failed: list[str] = []

    monkeypatch.setattr(knowledge_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(knowledge_tasks.task_repository, "get_task_by_id", lambda _db, _id: task)
    monkeypatch.setattr(knowledge_tasks.task_repository, "update_task_status", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        knowledge_tasks.task_repository,
        "mark_task_success",
        lambda _db, *, task, result_payload: marked_success.append(result_payload),
    )
    monkeypatch.setattr(
        knowledge_tasks.task_repository,
        "mark_task_failed",
        lambda _db, *, task, error_message: marked_failed.append(error_message),
    )
    monkeypatch.setattr(knowledge_tasks.knowledge_repository, "get_document", lambda _db, _id: next(documents))
    monkeypatch.setattr(knowledge_tasks.knowledge_repository, "update_document_status", lambda *args, **kwargs: None)
    monkeypatch.setattr(knowledge_tasks.file_repository, "get_by_id", lambda _db, _id: SimpleNamespace(id=22))
    monkeypatch.setattr(knowledge_tasks, "ingest_document", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("ObjectDeletedError")))

    result = knowledge_tasks.run_knowledge_ingest_task.run(7)

    assert result["status"] == "success"
    assert result["chunk_count"] == 26
    assert result["recovered_from"] == "RuntimeError"
    assert marked_success and not marked_failed
