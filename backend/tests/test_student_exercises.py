from __future__ import annotations

from fastapi.testclient import TestClient

from test_course_flow import auth, client, register_and_login  # noqa: F401


def test_student_personal_exercise_crud_actions(client: TestClient):
    student_token = register_and_login(client, "student_exercise_owner", "student")
    other_token = register_and_login(client, "student_exercise_other", "student")

    created = client.post(
        "/api/v1/student/exercises",
        json={
            "title": "FastAPI personal practice",
            "description": "Practice dependency and route concepts.",
            "content": "Explain FastAPI dependency injection with one route example.",
            "answer": "FastAPI dependency route example",
            "explanation": "Mention dependency injection, route handler, and example.",
            "difficulty": "medium",
            "category": "Personal practice",
            "tags": ["FastAPI", "dependency", "route"],
        },
        headers=auth(student_token),
    )
    assert created.status_code == 201, created.text
    data = created.json()["data"]
    exercise_id = data["id"]
    assert exercise_id.startswith("personal:")
    assert data["source"] == "personal"
    assert data["questions"]

    listed = client.get("/api/v1/student/exercises", headers=auth(student_token))
    assert listed.status_code == 200, listed.text
    assert any(item["id"] == exercise_id for item in listed.json()["data"]["items"])

    forbidden = client.get(f"/api/v1/student/exercises/{exercise_id}", headers=auth(other_token))
    assert forbidden.status_code == 403

    started = client.post(f"/api/v1/student/exercises/{exercise_id}/start", headers=auth(student_token))
    assert started.status_code == 200, started.text
    assert started.json()["data"]["exercise"]["status"] == "in_progress"

    submitted = client.post(
        f"/api/v1/student/exercises/{exercise_id}/submit",
        json={"answers": {"q1": "FastAPI dependency injection can pass a database session into a route example."}},
        headers=auth(student_token),
    )
    assert submitted.status_code == 200, submitted.text
    submit_data = submitted.json()["data"]
    assert submit_data["status"] == "graded"
    assert submit_data["score"] >= 0
    assert submit_data["question_results"]
    assert submit_data["exercise"]["quality_analysis"]

    favorited = client.post(f"/api/v1/student/exercises/{exercise_id}/favorite", headers=auth(student_token))
    assert favorited.status_code == 200, favorited.text
    assert favorited.json()["data"]["is_favorite"] is True

    completed = client.post(f"/api/v1/student/exercises/{exercise_id}/complete", headers=auth(student_token))
    assert completed.status_code == 200, completed.text
    assert completed.json()["data"]["status"] == "completed"

    updated = client.patch(
        f"/api/v1/student/exercises/{exercise_id}",
        json={"title": "Updated personal practice"},
        headers=auth(student_token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["title"] == "Updated personal practice"

    deleted = client.delete(f"/api/v1/student/exercises/{exercise_id}", headers=auth(student_token))
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["data"]["deleted"] is True
    missing = client.get(f"/api/v1/student/exercises/{exercise_id}", headers=auth(student_token))
    assert missing.status_code == 404


def test_student_exercises_aggregate_course_assignment(client: TestClient):
    teacher_token = register_and_login(client, "student_exercise_teacher", "teacher")
    student_token = register_and_login(client, "student_exercise_member", "student")

    created_course = client.post(
        "/api/v1/courses",
        json={"name": "Student Exercise Course"},
        headers=auth(teacher_token),
    )
    assert created_course.status_code == 201, created_course.text
    course = created_course.json()["data"]
    course_id = course["id"]
    client.post("/api/v1/courses/join", json={"code": course["code"]}, headers=auth(student_token))

    created_assignment = client.post(
        f"/api/v1/courses/{course_id}/assignments",
        json={
            "title": "Routes and validation practice",
            "topic": "FastAPI routes",
            "difficulty": "medium",
            "question_count": 2,
            "question_types": ["single_choice", "short_answer"],
        },
        headers=auth(teacher_token),
    )
    assert created_assignment.status_code == 201, created_assignment.text
    assignment = created_assignment.json()["data"]
    aggregate_id = f"assignment:{course_id}:{assignment['id']}"

    listed = client.get("/api/v1/student/exercises", headers=auth(student_token))
    assert listed.status_code == 200, listed.text
    assert any(item["id"] == aggregate_id and item["source"] == "assignment" for item in listed.json()["data"]["items"])

    detail = client.get(f"/api/v1/student/exercises/{aggregate_id}", headers=auth(student_token))
    assert detail.status_code == 200, detail.text
    assert detail.json()["data"]["answer_key"] is None
    assert detail.json()["data"]["questions"]

    started = client.post(f"/api/v1/student/exercises/{aggregate_id}/start", headers=auth(student_token))
    assert started.status_code == 200, started.text
    assert started.json()["data"]["exercise"]["status"] == "in_progress"

    answers = {question_id: answer["answer"] for question_id, answer in assignment["answer_key"].items()}
    submitted = client.post(
        f"/api/v1/student/exercises/{aggregate_id}/submit",
        json={"answers": answers},
        headers=auth(student_token),
    )
    assert submitted.status_code == 200, submitted.text
    submit_data = submitted.json()["data"]
    assert submit_data["status"] == "graded"
    assert submit_data["answer_key"]
    assert submit_data["exercise"]["answer_key"]

    favorite_assignment = client.post(f"/api/v1/student/exercises/{aggregate_id}/favorite", headers=auth(student_token))
    assert favorite_assignment.status_code == 400
