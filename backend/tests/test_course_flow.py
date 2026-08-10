from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.deps import get_db
from app.db.base import Base
from app.main import app


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def register_and_login(client: TestClient, username: str, role: str) -> str:
    password = "CourseFlow123!"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": password,
            "role": role,
            "full_name": username.replace("_", " ").title(),
        },
    )
    assert response.status_code == 200, response.text
    login = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert login.status_code == 200, login.text
    return login.json()["data"]["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def upload_course_text_file(client: TestClient, course_id: int, token: str, filename: str, content: str) -> dict:
    response = client.post(
        f"/api/v1/courses/{course_id}/files/upload",
        headers=auth(token),
        files={"file": (filename, content.encode("utf-8"), "text/plain")},
    )
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_batch_upload_partial_success_and_auto_document(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    teacher_token = register_and_login(client, "batch_upload_teacher", "teacher")
    monkeypatch.setattr("app.api.v1.files._dispatch_parse", lambda file_id, force=False: None)
    partial = client.post(
        "/api/v1/files/upload-batch",
        headers=auth(teacher_token),
        files=[
            ("files", ("valid.txt", "可解析课程资料".encode("utf-8"), "application/octet-stream")),
            ("files", ("invalid.exe", b"MZ", "application/octet-stream")),
        ],
        data={"purpose": "teaching_reference"},
    )
    assert partial.status_code == 200, partial.text
    result = partial.json()["data"]
    assert result["succeeded"] == 1
    assert result["failed"] == 1
    assert result["items"][0]["parse_status"] == "pending"
    assert result["items"][1]["error_code"] == "upload_failed"

    course = client.post(
        "/api/v1/courses",
        headers=auth(teacher_token),
        json={"name": "Batch knowledge course", "description": "auto ingest"},
    ).json()["data"]
    monkeypatch.setattr("app.api.v1.files.run_knowledge_ingest_task.run", lambda task_id: {"status": "success"})
    auto = client.post(
        "/api/v1/files/upload-batch",
        headers=auth(teacher_token),
        files=[("files", ("knowledge.md", "# 自动入库".encode("utf-8"), "application/octet-stream"))],
        data={"purpose": "course_material", "course_id": str(course["id"]), "auto_ingest": "true"},
    )
    assert auto.status_code == 200, auto.text
    item = auto.json()["data"]["items"][0]
    assert item["success"] is True
    assert item["knowledge_document_id"] is not None

    student_token = register_and_login(client, "batch_upload_student", "student")
    private_auto = client.post(
        "/api/v1/files/upload-batch",
        headers=auth(student_token),
        files=[("files", ("private-notes.md", "# 私人复习资料".encode("utf-8"), "application/octet-stream"))],
        data={"purpose": "knowledge_source", "auto_ingest": "true"},
    )
    assert private_auto.status_code == 200, private_auto.text
    private_item = private_auto.json()["data"]["items"][0]
    assert private_item["success"] is True
    assert private_item["knowledge_document_id"] is not None


def test_task_stream_requires_bearer_token(client: TestClient):
    unauthorized = client.get("/api/v1/tasks/999999/stream")
    assert unauthorized.status_code == 401
    token = register_and_login(client, "task_stream_teacher", "teacher")
    authorized = client.get("/api/v1/tasks/999999/stream", headers=auth(token))
    assert authorized.status_code == 404


def test_course_member_flow_and_permissions(client: TestClient):
    teacher_token = register_and_login(client, "course_teacher", "teacher")
    student_token = register_and_login(client, "course_student", "student")
    other_student_token = register_and_login(client, "course_other_student", "student")
    admin_token = register_and_login(client, "course_admin", "admin")

    created = client.post(
        "/api/v1/courses",
        json={"name": "F1 FastAPI Course", "description": "Course loop test"},
        headers=auth(teacher_token),
    )
    assert created.status_code == 201, created.text
    course = created.json()["data"]
    assert course["code"].startswith("PM-")
    assert course["current_user_role"] == "teacher"
    course_id = course["id"]

    members = client.get(f"/api/v1/courses/{course_id}/members", headers=auth(teacher_token))
    assert members.status_code == 200, members.text
    assert members.json()["data"]["total"] == 1
    assert members.json()["data"]["items"][0]["role"] == "teacher"

    joined = client.post("/api/v1/courses/join", json={"code": course["code"]}, headers=auth(student_token))
    assert joined.status_code == 200, joined.text
    join_data = joined.json()["data"]
    assert join_data["member"]["role"] == "student"
    assert join_data["already_joined"] is False

    duplicate = client.post("/api/v1/courses/join", json={"code": course["code"]}, headers=auth(student_token))
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["data"]["already_joined"] is True

    members = client.get(f"/api/v1/courses/{course_id}/members", headers=auth(teacher_token)).json()["data"]
    student_members = [item for item in members["items"] if item["role"] == "student"]
    assert len(student_members) == 1

    detail = client.get(f"/api/v1/courses/{course_id}", headers=auth(student_token))
    assert detail.status_code == 200, detail.text
    assert detail.json()["data"]["current_user_role"] == "student"

    forbidden_detail = client.get(f"/api/v1/courses/{course_id}", headers=auth(other_student_token))
    assert forbidden_detail.status_code == 403

    forbidden_update = client.patch(
        f"/api/v1/courses/{course_id}",
        json={"name": "Student cannot edit"},
        headers=auth(student_token),
    )
    assert forbidden_update.status_code == 403

    forbidden_members = client.get(f"/api/v1/courses/{course_id}/members", headers=auth(student_token))
    assert forbidden_members.status_code == 403

    updated = client.patch(
        f"/api/v1/courses/{course_id}",
        json={"name": "F1 Updated FastAPI Course"},
        headers=auth(teacher_token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["name"] == "F1 Updated FastAPI Course"

    archived = client.post(f"/api/v1/courses/{course_id}/archive", headers=auth(teacher_token))
    assert archived.status_code == 200, archived.text
    assert archived.json()["data"]["status"] == "archived"

    blocked_join = client.post("/api/v1/courses/join", json={"code": course["code"]}, headers=auth(other_student_token))
    assert blocked_join.status_code == 400

    admin_detail = client.get(f"/api/v1/courses/{course_id}", headers=auth(admin_token))
    assert admin_detail.status_code == 200, admin_detail.text
    assert admin_detail.json()["data"]["current_user_role"] == "admin"


def test_file_center_list_persists_uploaded_files(client: TestClient):
    teacher_token = register_and_login(client, "file_center_teacher", "teacher")
    other_token = register_and_login(client, "file_center_other", "student")

    before = client.get("/api/v1/files", headers=auth(teacher_token))
    assert before.status_code == 200, before.text
    assert before.json()["data"]["total"] == 0

    uploaded = client.post(
        "/api/v1/files/upload",
        headers=auth(teacher_token),
        files={"file": ("file_center_notes.txt", "File center list persistence test.".encode("utf-8"), "text/plain")},
    )
    assert uploaded.status_code == 200, uploaded.text
    file_id = uploaded.json()["data"]["id"]

    listed = client.get("/api/v1/files", headers=auth(teacher_token))
    assert listed.status_code == 200, listed.text
    listed_data = listed.json()["data"]
    assert listed_data["total"] == 1
    assert listed_data["items"][0]["id"] == file_id
    assert listed_data["items"][0]["original_filename"] == "file_center_notes.txt"

    other_list = client.get("/api/v1/files", headers=auth(other_token))
    assert other_list.status_code == 200, other_list.text
    assert other_list.json()["data"]["total"] == 0


def test_course_knowledge_flow_and_permissions(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    def fake_retrieve(**kwargs):
        return [
            {
                "content": "FastAPI routes use dependencies. Pydantic validates request payloads.",
                "metadata": {
                    "owner_id": kwargs["owner_id"],
                    "course_id": kwargs.get("course_id"),
                    "document_id": kwargs.get("document_id") or 1,
                    "chunk_index": 0,
                    "source_filename": "f2a_fastapi_notes.txt",
                },
                "score": 0.01,
            }
        ]

    monkeypatch.setattr("app.api.v1.courses.retrieve", fake_retrieve)

    teacher_token = register_and_login(client, "knowledge_teacher", "teacher")
    other_teacher_token = register_and_login(client, "knowledge_other_teacher", "teacher")
    student_token = register_and_login(client, "knowledge_student", "student")
    other_student_token = register_and_login(client, "knowledge_other_student", "student")

    created = client.post(
        "/api/v1/courses",
        json={"name": "F2A Course Knowledge", "description": "Course knowledge test"},
        headers=auth(teacher_token),
    )
    assert created.status_code == 201, created.text
    course = created.json()["data"]
    course_id = course["id"]

    joined = client.post("/api/v1/courses/join", json={"code": course["code"]}, headers=auth(student_token))
    assert joined.status_code == 200, joined.text

    file_asset = upload_course_text_file(
        client,
        course_id,
        teacher_token,
        "f2a_fastapi_notes.txt",
        "FastAPI routes use dependencies. Pydantic validates request payloads. Celery runs async tasks.",
    )
    file_id = file_asset["id"]
    files = client.get(f"/api/v1/courses/{course_id}/files", headers=auth(teacher_token))
    assert files.status_code == 200, files.text
    assert any(item["id"] == file_id for item in files.json()["data"]["items"])

    created_doc = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents",
        json={"file_id": file_id, "title": "F2A FastAPI Notes"},
        headers=auth(teacher_token),
    )
    assert created_doc.status_code == 200, created_doc.text
    document = created_doc.json()["data"]
    document_id = document["id"]
    assert document["course_id"] == course_id
    assert document["filename"] == "f2a_fastapi_notes.txt"
    assert document["status"] == "ingested"
    assert document["chunk_count"] >= 1
    assert document["ingest_task_id"] is not None

    duplicate_doc = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents",
        json={"file_id": file_id, "title": "F2A FastAPI Notes Duplicate"},
        headers=auth(teacher_token),
    )
    assert duplicate_doc.status_code == 200, duplicate_doc.text
    assert duplicate_doc.json()["data"]["id"] == document_id

    ingested = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents/{document_id}/ingest",
        headers=auth(teacher_token),
    )
    assert ingested.status_code == 200, ingested.text
    assert ingested.json()["data"]["chunk_count"] >= 1

    student_docs = client.get(f"/api/v1/courses/{course_id}/knowledge/documents", headers=auth(student_token))
    assert student_docs.status_code == 200, student_docs.text
    student_document = next(item for item in student_docs.json()["data"]["items"] if item["id"] == document_id)
    assert student_document["added_to_personal"] is False
    assert student_document["personal_document_id"] is None

    student_download = client.get(f"/api/v1/files/{file_id}/download", headers=auth(student_token))
    assert student_download.status_code == 200, student_download.text

    copied = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents/{document_id}/copy-to-personal",
        headers=auth(student_token),
    )
    assert copied.status_code == 200, copied.text
    copied_data = copied.json()["data"]
    assert copied_data["status"] == "ingested"
    assert copied_data["chunk_count"] == document["chunk_count"]
    assert copied_data["already_added"] is False

    student_docs_after_copy = client.get(
        f"/api/v1/courses/{course_id}/knowledge/documents",
        headers=auth(student_token),
    )
    assert student_docs_after_copy.status_code == 200, student_docs_after_copy.text
    copied_course_document = next(
        item for item in student_docs_after_copy.json()["data"]["items"] if item["id"] == document_id
    )
    assert copied_course_document["added_to_personal"] is True
    assert copied_course_document["personal_document_id"] == copied_data["personal_document_id"]
    assert copied_course_document["personal_document_status"] == "ingested"

    copied_again = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents/{document_id}/copy-to-personal",
        headers=auth(student_token),
    )
    assert copied_again.status_code == 200, copied_again.text
    assert copied_again.json()["data"]["personal_document_id"] == copied_data["personal_document_id"]
    assert copied_again.json()["data"]["already_added"] is True

    personal_documents = client.get("/api/v1/knowledge/documents?page=1&page_size=100", headers=auth(student_token))
    assert personal_documents.status_code == 200, personal_documents.text
    assert any(
        item["id"] == copied_data["personal_document_id"] and item["course_id"] is None
        for item in personal_documents.json()["data"]["items"]
    )

    retrieved = client.post(
        f"/api/v1/courses/{course_id}/knowledge/retrieve",
        json={"query": "How does FastAPI validate payloads?", "top_k": 3},
        headers=auth(student_token),
    )
    assert retrieved.status_code == 200, retrieved.text
    assert retrieved.json()["data"]["results"]

    forbidden_delete = client.delete(
        f"/api/v1/courses/{course_id}/knowledge/documents/{document_id}",
        headers=auth(student_token),
    )
    assert forbidden_delete.status_code == 403

    nonmember_docs = client.get(f"/api/v1/courses/{course_id}/knowledge/documents", headers=auth(other_student_token))
    assert nonmember_docs.status_code == 403
    nonmember_download = client.get(f"/api/v1/files/{file_id}/download", headers=auth(other_student_token))
    assert nonmember_download.status_code == 403

    other_teacher_create = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents",
        json={"file_id": file_id, "title": "Should be forbidden"},
        headers=auth(other_teacher_token),
    )
    assert other_teacher_create.status_code == 403

    other_course = client.post(
        "/api/v1/courses",
        json={"name": "F2A Other Knowledge Course"},
        headers=auth(teacher_token),
    ).json()["data"]
    other_file = upload_course_text_file(
        client,
        other_course["id"],
        teacher_token,
        "f2a_other_notes.txt",
        "This document belongs to another course.",
    )
    other_doc = client.post(
        f"/api/v1/courses/{other_course['id']}/knowledge/documents",
        json={"file_id": other_file["id"], "title": "Other course notes"},
        headers=auth(teacher_token),
    ).json()["data"]
    over_scope = client.post(
        f"/api/v1/courses/{course_id}/knowledge/retrieve",
        json={"query": "FastAPI", "document_ids": [other_doc["id"]]},
        headers=auth(student_token),
    )
    assert over_scope.status_code == 400

    deleted = client.delete(
        f"/api/v1/courses/{course_id}/knowledge/documents/{document_id}",
        headers=auth(teacher_token),
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["data"]["deleted"] is True

    file_still_exists = client.get(f"/api/v1/files/{file_id}", headers=auth(teacher_token))
    assert file_still_exists.status_code == 200, file_still_exists.text


def _answers_from_answer_key(answer_key: dict) -> dict:
    answers = {}
    for question_id, detail in answer_key.items():
        answers[question_id] = detail["answer"]
    return answers


def test_course_assignment_publish_submit_and_permissions(client: TestClient):
    teacher_token = register_and_login(client, "assignment_teacher", "teacher")
    student_token = register_and_login(client, "assignment_student", "student")
    other_student_token = register_and_login(client, "assignment_other_student", "student")

    created = client.post(
        "/api/v1/courses",
        json={"name": "F2B Course Assignments", "description": "Assignment loop test"},
        headers=auth(teacher_token),
    )
    assert created.status_code == 201, created.text
    course = created.json()["data"]
    course_id = course["id"]
    client.post("/api/v1/courses/join", json={"code": course["code"]}, headers=auth(student_token))

    file_asset = upload_course_text_file(
        client,
        course_id,
        teacher_token,
        "f2b_fastapi_notes.txt",
        "FastAPI routes define methods and paths. Pydantic validates payloads before service logic.",
    )
    created_doc = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents",
        json={"file_id": file_asset["id"], "title": "F2B FastAPI Notes"},
        headers=auth(teacher_token),
    )
    assert created_doc.status_code == 200, created_doc.text
    document_id = created_doc.json()["data"]["id"]

    other_course = client.post(
        "/api/v1/courses",
        json={"name": "F2B Other Course"},
        headers=auth(teacher_token),
    ).json()["data"]
    other_file = upload_course_text_file(
        client,
        other_course["id"],
        teacher_token,
        "f2b_other_notes.txt",
        "This document belongs to another course.",
    )
    other_doc = client.post(
        f"/api/v1/courses/{other_course['id']}/knowledge/documents",
        json={"file_id": other_file["id"], "title": "Other assignment notes"},
        headers=auth(teacher_token),
    ).json()["data"]

    over_scope = client.post(
        f"/api/v1/courses/{course_id}/assignments",
        json={
            "title": "Should fail",
            "topic": "FastAPI",
            "knowledge_document_ids": [other_doc["id"]],
            "question_count": 2,
        },
        headers=auth(teacher_token),
    )
    assert over_scope.status_code == 400

    draft = client.post(
        f"/api/v1/courses/{course_id}/assignments",
        json={
            "title": "Draft FastAPI Quiz",
            "topic": "FastAPI draft",
            "status": "draft",
            "question_count": 2,
            "question_types": ["single_choice", "true_false"],
        },
        headers=auth(teacher_token),
    )
    assert draft.status_code == 201, draft.text
    draft_id = draft.json()["data"]["id"]

    created_assignment = client.post(
        f"/api/v1/courses/{course_id}/assignments",
        json={
            "title": "FastAPI 路由与数据校验随堂测验",
            "description": "覆盖课程知识库中的 FastAPI 路由和 Pydantic 校验。",
            "assignment_type": "quiz",
            "topic": "FastAPI 路由与数据校验",
            "difficulty": "medium",
            "question_count": 4,
            "question_types": ["single_choice", "multiple_choice", "true_false", "short_answer"],
            "knowledge_document_ids": [document_id],
        },
        headers=auth(teacher_token),
    )
    assert created_assignment.status_code == 201, created_assignment.text
    assignment = created_assignment.json()["data"]
    assignment_id = assignment["id"]
    assert assignment["status"] == "published"
    assert assignment["answer_key"]
    assert assignment["knowledge_document_ids"] == [document_id]
    assert assignment["quality_analysis"]["evidence_available"] is True
    assert assignment["quality_analysis"]["source_coverage"] is not None
    assert len(assignment["quality_analysis"]["evidence_sources"]) >= 1

    teacher_list = client.get(f"/api/v1/courses/{course_id}/assignments", headers=auth(teacher_token))
    assert teacher_list.status_code == 200, teacher_list.text
    teacher_ids = {item["id"] for item in teacher_list.json()["data"]["items"]}
    assert {assignment_id, draft_id}.issubset(teacher_ids)

    student_list = client.get(f"/api/v1/courses/{course_id}/assignments", headers=auth(student_token))
    assert student_list.status_code == 200, student_list.text
    student_items = student_list.json()["data"]["items"]
    student_ids = {item["id"] for item in student_items}
    assert assignment_id in student_ids
    assert draft_id not in student_ids

    nonmember_list = client.get(f"/api/v1/courses/{course_id}/assignments", headers=auth(other_student_token))
    assert nonmember_list.status_code == 403

    draft_detail = client.get(f"/api/v1/courses/{course_id}/assignments/{draft_id}", headers=auth(student_token))
    assert draft_detail.status_code == 403

    started = client.post(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/start",
        headers=auth(student_token),
    )
    assert started.status_code == 200, started.text
    started_data = started.json()["data"]
    assert started_data["submission"]["status"] == "in_progress"
    assert started_data["assignment"]["answer_key"] is None
    assert started_data["assignment"]["questions"]

    submissions_forbidden = client.get(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions",
        headers=auth(student_token),
    )
    assert submissions_forbidden.status_code == 403

    student_answers = _answers_from_answer_key(assignment["answer_key"])
    student_answers[next(iter(student_answers))] = "__wrong_answer__"
    submitted = client.post(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/submit",
        json={"answers": student_answers},
        headers=auth(student_token),
    )
    assert submitted.status_code == 200, submitted.text
    submit_data = submitted.json()["data"]
    assert submit_data["status"] == "graded"
    assert submit_data["score"] >= 60
    assert submit_data["question_results"]
    assert submit_data["answer_key"]
    assert submit_data["quality_analysis"]["evidence_available"] is True
    assert submit_data["quality_analysis"]["evidence_sources"]
    assert submit_data["profile_snapshot"]["scores"]["exam_score"] > 0
    assert all(item.get("grading_basis") for item in submit_data["question_results"])
    assert all(item.get("knowledge_evidence") for item in submit_data["question_results"])

    duplicate_submit = client.post(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/submit",
        json={"answers": _answers_from_answer_key(assignment["answer_key"])},
        headers=auth(student_token),
    )
    assert duplicate_submit.status_code == 400

    student_detail_after_submit = client.get(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}",
        headers=auth(student_token),
    )
    assert student_detail_after_submit.status_code == 200, student_detail_after_submit.text
    assert student_detail_after_submit.json()["data"]["answer_key"]
    assert student_detail_after_submit.json()["data"]["current_student_submission"]["status"] == "graded"
    assert student_detail_after_submit.json()["data"]["current_student_submission"]["quality_analysis"]

    my_submission = client.get(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/me",
        headers=auth(student_token),
    )
    assert my_submission.status_code == 200, my_submission.text
    assert my_submission.json()["data"]["score"] >= 60

    submissions = client.get(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions",
        headers=auth(teacher_token),
    )
    assert submissions.status_code == 200, submissions.text
    assert submissions.json()["data"]["total"] == 1
    assert submissions.json()["data"]["items"][0]["student_username"] == "assignment_student"
    diagnostics = submissions.json()["data"]["diagnostics"]
    assert diagnostics["submitted_count"] == 1
    assert diagnostics["weak_topics"]
    assert diagnostics["teaching_focus"]
    assert "先用诊断问题定位误区，再做典型例题示范、变式练习和错因复盘" not in "".join(
        diagnostics["teaching_focus"]
    )
    assert "平均达成率" in diagnostics["evaluation"]

    members = client.get(f"/api/v1/courses/{course_id}/members", headers=auth(teacher_token))
    assert members.status_code == 200, members.text
    student_member = next(item for item in members.json()["data"]["items"] if item["role"] == "student")
    assert student_member["profile"]["exam_score"] > 0
    assert student_member["profile"]["updated_at"]

    other_submit = client.post(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/submit",
        json={"answers": {}},
        headers=auth(other_student_token),
    )
    assert other_submit.status_code == 403

    closed = client.post(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/close",
        headers=auth(teacher_token),
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["data"]["status"] == "closed"

    closed_start = client.post(
        f"/api/v1/courses/{course_id}/assignments/{assignment_id}/start",
        headers=auth(student_token),
    )
    assert closed_start.status_code == 400

    archived = client.post(f"/api/v1/courses/{course_id}/archive", headers=auth(teacher_token))
    assert archived.status_code == 200
    blocked_create = client.post(
        f"/api/v1/courses/{course_id}/assignments",
        json={"title": "Archived course assignment", "topic": "FastAPI", "question_count": 1},
        headers=auth(teacher_token),
    )
    assert blocked_create.status_code == 400


def test_quality_analysis_on_teacher_artifact_and_student_test(client: TestClient):
    teacher_token = register_and_login(client, "quality_teacher", "teacher")
    student_token = register_and_login(client, "quality_student", "student")

    course = client.post(
        "/api/v1/courses",
        json={"name": "Quality Class", "description": "Class profile grounding"},
        headers=auth(teacher_token),
    ).json()["data"]
    joined = client.post(
        "/api/v1/courses/join",
        json={"code": course["code"]},
        headers=auth(student_token),
    )
    assert joined.status_code == 200, joined.text

    generated = client.post(
        "/api/v1/teacher/course-designs/generate",
        json={
            "course_id": course["id"],
            "course_name": "FastAPI 接口设计",
            "target_students": "软件工程本科生",
            "total_hours": 32,
            "course_objectives": "理解路由设计、依赖注入、Pydantic 校验和错误处理。",
            "key_topics": ["FastAPI", "依赖注入", "Pydantic 校验", "错误处理"],
            "additional_requirements": "给出案例、步骤和评价标准。",
        },
        headers=auth(teacher_token),
    )
    assert generated.status_code == 200, generated.text
    generated_data = generated.json()["data"]
    assert "Quality Class" in generated_data["content"]
    assert generated_data["quality_analysis"]["analysis_version"] == "qa-v2"
    assert generated_data["quality_analysis"]["evidence_available"] is False
    assert generated_data["quality_analysis"]["source_coverage"] is None

    artifact_detail = client.get(
        f"/api/v1/teacher/generated-artifacts/{generated_data['artifact_id']}",
        headers=auth(teacher_token),
    )
    assert artifact_detail.status_code == 200, artifact_detail.text
    assert artifact_detail.json()["data"]["quality_analysis"] == generated_data["quality_analysis"]
    class_snapshot = artifact_detail.json()["data"]["request_payload"]["class_profile_snapshot"]
    assert class_snapshot["course_name"] == "Quality Class"
    assert class_snapshot["student_count"] == 1

    test_created = client.post(
        "/api/v1/student/tests/generate",
        json={
            "topic": "FastAPI 路由",
            "difficulty": "medium",
            "question_count": 3,
            "question_types": ["single_choice", "true_false", "short_answer"],
            "knowledge_points": ["FastAPI", "路由", "Pydantic 校验"],
        },
        headers=auth(student_token),
    )
    assert test_created.status_code == 200, test_created.text
    test_id = test_created.json()["data"]["test_id"]
    started = client.post(f"/api/v1/student/tests/{test_id}/start", headers=auth(student_token))
    assert started.status_code == 200, started.text

    detail = client.get(f"/api/v1/student/tests/{test_id}", headers=auth(student_token)).json()["data"]
    submitted = client.post(
        f"/api/v1/student/tests/{test_id}/submit",
        json={"user_answers": _answers_from_answer_key(detail["answers"] or {})},
        headers=auth(student_token),
    )
    assert submitted.status_code == 200, submitted.text
    submitted_data = submitted.json()["data"]
    assert submitted_data["quality_analysis"]["evidence_available"] is False
    assert submitted_data["quality_analysis"]["source_coverage"] is None
    assert submitted_data["quality_analysis"]["unavailable_reason"]


def test_assistant_course_qa_attachment_and_permissions(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    def fake_retrieve(**kwargs):
        return [
            {
                "content": "FastAPI uses dependency injection, Pydantic validation, and SQLAlchemy sessions in course services.",
                "metadata": {
                    "owner_id": kwargs["owner_id"],
                    "course_id": kwargs.get("course_id"),
                    "document_id": kwargs.get("document_id") or document_id,
                    "chunk_index": 0,
                    "source_filename": "f4_assistant_notes.txt",
                },
                "score": 0.02,
            }
        ]

    teacher_token = register_and_login(client, "assistant_teacher", "teacher")
    student_token = register_and_login(client, "assistant_student", "student")
    other_student_token = register_and_login(client, "assistant_other_student", "student")

    created = client.post(
        "/api/v1/courses",
        json={"name": "F4 Assistant Course", "description": "Assistant course QA test"},
        headers=auth(teacher_token),
    )
    assert created.status_code == 201, created.text
    course = created.json()["data"]
    course_id = course["id"]
    client.post("/api/v1/courses/join", json={"code": course["code"]}, headers=auth(student_token))

    file_asset = upload_course_text_file(
        client,
        course_id,
        teacher_token,
        "f4_assistant_notes.txt",
        "FastAPI uses dependency injection. Pydantic validates payloads. SQLAlchemy persists sessions.",
    )
    created_doc = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents",
        json={"file_id": file_asset["id"], "title": "F4 Assistant Notes"},
        headers=auth(teacher_token),
    )
    assert created_doc.status_code == 200, created_doc.text
    document_id = created_doc.json()["data"]["id"]
    ingested = client.post(
        f"/api/v1/courses/{course_id}/knowledge/documents/{document_id}/ingest",
        headers=auth(teacher_token),
    )
    assert ingested.status_code == 200, ingested.text

    monkeypatch.setattr("app.services.assistant_service.retrieve", fake_retrieve)

    teacher_session = client.post(
        "/api/v1/assistant/sessions",
        json={"course_id": course_id, "mode": "course_qa", "title": "Teacher assistant session"},
        headers=auth(teacher_token),
    )
    assert teacher_session.status_code == 201, teacher_session.text
    teacher_session_id = teacher_session.json()["data"]["id"]

    teacher_answer = client.post(
        f"/api/v1/assistant/sessions/{teacher_session_id}/messages",
        json={
            "message": "FastAPI course services should be explained how?",
            "course_id": course_id,
            "use_course_knowledge": True,
            "knowledge_document_ids": [document_id],
            "answer_style": "step_by_step",
        },
        headers=auth(teacher_token),
    )
    assert teacher_answer.status_code == 200, teacher_answer.text
    teacher_data = teacher_answer.json()["data"]
    assert "分步骤" in teacher_data["answer"] or "步骤" in teacher_data["answer"]
    assert teacher_data["references"]
    assert teacher_data["references"][0]["source_type"] == "course_knowledge"
    assert teacher_data["used_documents"]

    student_session = client.post(
        "/api/v1/assistant/sessions",
        json={"course_id": course_id, "mode": "course_qa", "title": "Student assistant session"},
        headers=auth(student_token),
    )
    assert student_session.status_code == 201, student_session.text
    student_session_id = student_session.json()["data"]["id"]

    student_answer = client.post(
        f"/api/v1/assistant/sessions/{student_session_id}/messages",
        json={
            "message": "How does Pydantic help this course?",
            "use_course_knowledge": True,
            "knowledge_document_ids": [document_id],
            "answer_style": "normal",
        },
        headers=auth(student_token),
    )
    assert student_answer.status_code == 200, student_answer.text
    assert student_answer.json()["data"]["references"]

    nonmember_session = client.post(
        "/api/v1/assistant/sessions",
        json={"course_id": course_id, "mode": "course_qa"},
        headers=auth(other_student_token),
    )
    assert nonmember_session.status_code == 403

    forbidden_detail = client.get(
        f"/api/v1/assistant/sessions/{teacher_session_id}",
        headers=auth(student_token),
    )
    assert forbidden_detail.status_code == 403
    forbidden_delete = client.delete(
        f"/api/v1/assistant/sessions/{teacher_session_id}",
        headers=auth(student_token),
    )
    assert forbidden_delete.status_code == 403

    attachment_upload = client.post(
        "/api/v1/assistant/files/upload",
        headers=auth(student_token),
        files={"file": ("f4_attachment.txt", "Attachment context about Redis and Celery.".encode("utf-8"), "text/plain")},
    )
    assert attachment_upload.status_code == 200, attachment_upload.text
    attachment_id = attachment_upload.json()["data"]["id"]

    file_session = client.post(
        "/api/v1/assistant/sessions",
        json={"mode": "file_qa", "title": "File QA session"},
        headers=auth(student_token),
    )
    assert file_session.status_code == 201, file_session.text
    file_session_id = file_session.json()["data"]["id"]
    file_answer = client.post(
        f"/api/v1/assistant/sessions/{file_session_id}/messages",
        json={
            "message": "Summarize my attachment.",
            "attachment_file_ids": [attachment_id],
            "use_course_knowledge": False,
        },
        headers=auth(student_token),
    )
    assert file_answer.status_code == 200, file_answer.text
    file_data = file_answer.json()["data"]
    assert any(reference["source_type"] == "file" for reference in file_data["references"])
    assert "Attachment context" in file_data["references"][0]["excerpt"]

    monkeypatch.setattr("app.services.assistant_service.retrieve", lambda **kwargs: [])
    fallback = client.post(
        f"/api/v1/assistant/sessions/{student_session_id}/messages",
        json={
            "message": "What if there is no direct hit?",
            "course_id": course_id,
            "knowledge_document_ids": [document_id],
            "use_course_knowledge": True,
        },
        headers=auth(student_token),
    )
    assert fallback.status_code == 200, fallback.text
    fallback_data = fallback.json()["data"]
    assert fallback_data["references"] == []
    assert fallback_data["warnings"]
    assert "通用学习策略" in fallback_data["answer"]

    detail = client.get(f"/api/v1/assistant/sessions/{student_session_id}", headers=auth(student_token))
    assert detail.status_code == 200, detail.text
    assert len(detail.json()["data"]["messages"]) >= 4

    deleted = client.delete(f"/api/v1/assistant/sessions/{teacher_session_id}", headers=auth(teacher_token))
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["data"]["deleted"] is True

    tutoring = client.post(
        "/api/v1/student/tutoring/ask",
        json={"question": "What is FastAPI?", "use_knowledge_base": False, "response_format": "markdown"},
        headers=auth(student_token),
    )
    assert tutoring.status_code == 200, tutoring.text
    assert tutoring.json()["data"]["session_id"]
