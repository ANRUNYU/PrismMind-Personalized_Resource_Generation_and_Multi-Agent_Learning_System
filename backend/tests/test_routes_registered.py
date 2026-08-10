from __future__ import annotations

from app.main import app


def test_key_routes_registered():
    routes = set(app.openapi()["paths"])

    expected = {
        "/api/v1/auth/login",
        "/api/v1/courses",
        "/api/v1/files",
        "/api/v1/courses/{course_id}/assignments",
        "/api/v1/courses/{course_id}/assignments/{assignment_id}/submit",
        "/api/v1/courses/my",
        "/api/v1/courses/join",
        "/api/v1/teacher/training-plans/extract-skills",
        "/api/v1/teacher/course-designs/generate",
        "/api/v1/knowledge/documents/{document_id}/ingest-async",
        "/api/v1/knowledge/documents/{document_id}/retry-ingest",
        "/api/v1/files/upload-batch",
        "/api/v1/files/{file_id}/retry-parse",
        "/api/v1/tasks/{task_id}/stream",
        "/api/v1/student/resources/generate-async",
        "/api/v1/student/assessments",
        "/api/v1/student/assessments/{assessment_id}",
        "/api/v1/student/assessments/{assessment_id}/submit",
        "/api/v1/student/dashboard/summary",
        "/api/v1/student/exercises",
        "/api/v1/student/exercises/{exercise_id}/submit",
        "/api/v1/student/tests/generate",
        "/api/v1/student/tests/generate-async",
        "/api/v1/tasks",
        "/api/v1/llm/status",
    }
    assert expected.issubset(routes)
