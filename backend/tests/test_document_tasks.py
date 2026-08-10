from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.models.enums import FileParseStatus
from app.tasks import document_tasks


class FakeDb:
    def __init__(self):
        self.closed = False
    def close(self):
        self.closed = True
    def rollback(self):
        pass


def test_parse_task_transitions_pending_parsing_parsed(monkeypatch, tmp_path):
    db = FakeDb()
    asset = SimpleNamespace(id=7, original_filename="lesson.txt", storage_path="lesson.txt", parse_status=FileParseStatus.pending, updated_at=datetime.now(timezone.utc))
    transitions = []
    monkeypatch.setattr(document_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(document_tasks.file_repository, "get_by_id", lambda session, file_id: asset)
    def update(session, *, file_id, parse_status, **kwargs):
        transitions.append((parse_status, kwargs))
        asset.parse_status = parse_status
        return asset
    monkeypatch.setattr(document_tasks.file_repository, "update_parse_status", update)
    monkeypatch.setattr(document_tasks, "get_file_path", lambda path: tmp_path / path)
    monkeypatch.setattr(document_tasks, "parse_document", lambda path, suffix: "真实解析文本")
    result = document_tasks.parse_file_asset_task.run(7)
    assert [item[0] for item in transitions] == [FileParseStatus.parsing, FileParseStatus.parsed]
    assert transitions[-1][1]["parsed_text_char_count"] == len("真实解析文本")
    assert result["status"] == "parsed" and db.closed


def test_parse_task_failure_is_persisted_and_session_closed(monkeypatch, tmp_path):
    db = FakeDb()
    asset = SimpleNamespace(id=8, original_filename="broken.pdf", storage_path="broken.pdf", parse_status=FileParseStatus.pending, updated_at=datetime.now(timezone.utc))
    transitions = []
    monkeypatch.setattr(document_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(document_tasks.file_repository, "get_by_id", lambda session, file_id: asset)
    monkeypatch.setattr(document_tasks.file_repository, "update_parse_status", lambda session, **kwargs: transitions.append(kwargs) or asset)
    monkeypatch.setattr(document_tasks, "get_file_path", lambda path: tmp_path / path)
    monkeypatch.setattr(document_tasks, "parse_document", lambda path, suffix: (_ for _ in ()).throw(RuntimeError("损坏文件")))
    with pytest.raises(RuntimeError, match="损坏文件"):
        document_tasks.parse_file_asset_task.run(8)
    assert transitions[-1]["parse_status"] == FileParseStatus.failed
    assert transitions[-1]["parse_error"] == "损坏文件"
    assert db.closed


def test_parse_task_is_idempotent_after_success(monkeypatch):
    db = FakeDb()
    asset = SimpleNamespace(id=9, original_filename="done.txt", parse_status=FileParseStatus.parsed)
    monkeypatch.setattr(document_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(document_tasks.file_repository, "get_by_id", lambda session, file_id: asset)
    result = document_tasks.parse_file_asset_task.run(9)
    assert result["idempotent"] is True
    assert db.closed
