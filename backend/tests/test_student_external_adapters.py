from __future__ import annotations

from fastapi.testclient import TestClient

from test_course_flow import auth, client, register_and_login  # noqa: F401


def test_student_assessment_detail_submit_and_dashboard_summary(client: TestClient):  # noqa: F811
    student_token = register_and_login(client, "external_student", "student")
    other_student_token = register_and_login(client, "external_other_student", "student")

    created = client.post(
        "/api/v1/student/assessments",
        json={
            "assessment_type": "topic",
            "topic": "外部评估接口适配",
            "score": 76,
            "correct_topics": ["画像读取"],
            "incorrect_topics": ["提交反馈"],
            "learning_evidence": {"reflection": "需要补齐提交逻辑。"},
        },
        headers=auth(student_token),
    )
    assert created.status_code == 200, created.text
    assessment = created.json()["data"]
    assessment_id = assessment["id"]
    assert assessment["assessment_id"] == assessment_id
    assert assessment["quality_analysis"] is None

    detail = client.get(f"/api/v1/student/assessments/{assessment_id}", headers=auth(student_token))
    assert detail.status_code == 200, detail.text
    detail_data = detail.json()["data"]
    assert detail_data["assessment_id"] == assessment_id
    assert detail_data["title"] == "外部评估接口适配"
    assert detail_data["target_type"] == "topic"
    assert detail_data["weak_topics"] == ["提交反馈"]

    forbidden = client.get(f"/api/v1/student/assessments/{assessment_id}", headers=auth(other_student_token))
    assert forbidden.status_code == 403

    submitted = client.post(
        f"/api/v1/student/assessments/{assessment_id}/submit",
        json={
            "answers": {
                "strengths": ["真实详情接口"],
                "weak_topics": ["dashboard summary"],
            },
            "reflection": "已经验证详情接口，继续补聚合接口。",
            "self_rating": 88,
            "feedback": "提交接口应返回更新后的评估详情。",
        },
        headers=auth(student_token),
    )
    assert submitted.status_code == 200, submitted.text
    submitted_data = submitted.json()["data"]
    assert submitted_data["score"] == 88
    assert submitted_data["level"] == "良好"
    assert submitted_data["reflection"] == "已经验证详情接口，继续补聚合接口。"
    assert "真实详情接口" in submitted_data["strengths"]
    assert "dashboard summary" in submitted_data["weak_topics"]
    assert submitted_data["submitted_at"]
    assert submitted_data["quality_analysis"] is None

    dashboard = client.get("/api/v1/student/dashboard/summary", headers=auth(student_token))
    assert dashboard.status_code == 200, dashboard.text
    dashboard_data = dashboard.json()["data"]
    assert dashboard_data["assessments"]["total"] == 1
    assert dashboard_data["assessments"]["recent_score"] == 88
    assert dashboard_data["courses"]["total"] == 0
    assert dashboard_data["resources"]["total"] == 0
    assert dashboard_data["tutoring"]["sessions"] == 0
    assert dashboard_data["llm"]["provider"] == "mock"


def test_test_assessment_reuses_generation_quality_without_fake_coverage(client: TestClient):  # noqa: F811
    student_token = register_and_login(client, "assessment_quality_student", "student")

    generated = client.post(
        "/api/v1/student/tests/generate",
        json={
            "topic": "无知识库质量报告",
            "difficulty": "medium",
            "question_count": 5,
            "question_types": ["single_choice", "multiple_choice", "true_false", "short_answer"],
            "use_question_bank": False,
            "use_knowledge_base": False,
            "file_ids": [],
            "knowledge_document_ids": [],
        },
        headers=auth(student_token),
    )
    assert generated.status_code == 200, generated.text
    generation_data = generated.json()["data"]
    generation_quality = generation_data["quality_analysis"]
    assert generation_quality["analysis_version"] == "qa-v2"
    assert generation_quality["evidence_available"] is False
    assert generation_quality["source_coverage"] is None
    assert generation_quality["diagnostic_confidence"] is None

    submitted = client.post(
        f"/api/v1/student/tests/{generation_data['test_id']}/submit",
        json={"user_answers": {}},
        headers=auth(student_token),
    )
    assert submitted.status_code == 200, submitted.text
    assessment_id = submitted.json()["data"]["assessment_id"]

    detail = client.get(
        f"/api/v1/student/assessments/{assessment_id}",
        headers=auth(student_token),
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["data"]["quality_analysis"] == generation_quality


def test_student_can_delete_own_resource_from_database(client: TestClient):  # noqa: F811
    student_token = register_and_login(client, "resource_delete_student", "student")
    other_student_token = register_and_login(client, "resource_delete_other", "student")

    created = client.post(
        "/api/v1/student/resources/generate-single",
        json={
            "topic": "网络工程",
            "resource_type": "concept_explanation",
            "difficulty": "normal",
            "use_profile": False,
            "use_knowledge_base": False,
            "top_k": 5,
        },
        headers=auth(student_token),
    )
    assert created.status_code == 200, created.text
    resource_id = created.json()["data"]["resources"][0]["id"]

    forbidden = client.delete(
        f"/api/v1/student/resources/{resource_id}",
        headers=auth(other_student_token),
    )
    assert forbidden.status_code == 403

    deleted = client.delete(
        f"/api/v1/student/resources/{resource_id}",
        headers=auth(student_token),
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["data"] == {"resource_id": resource_id, "deleted": True}

    missing = client.get(
        f"/api/v1/student/resources/{resource_id}",
        headers=auth(student_token),
    )
    assert missing.status_code == 404


def test_student_test_list_uses_actual_question_score_total(client: TestClient):  # noqa: F811
    student_token = register_and_login(client, "test_total_score_student", "student")

    created = client.post(
        "/api/v1/student/tests/generate",
        json={
            "topic": "机房技术",
            "difficulty": "medium",
            "question_count": 5,
            "question_types": ["single_choice", "multiple_choice", "true_false", "short_answer"],
            "use_question_bank": False,
        },
        headers=auth(student_token),
    )
    assert created.status_code == 200, created.text
    test_id = created.json()["data"]["test_id"]

    listed = client.get("/api/v1/student/tests", headers=auth(student_token))
    assert listed.status_code == 200, listed.text
    summary = next(item for item in listed.json()["data"]["items"] if item["id"] == test_id)
    assert summary["question_count"] == 5
    assert summary["total_score"] == 100

    detail = client.get(f"/api/v1/student/tests/{test_id}", headers=auth(student_token))
    assert detail.status_code == 200, detail.text
    assert detail.json()["data"]["total_score"] == 100


def test_student_test_async_generation_creates_streamable_task(client: TestClient, monkeypatch):  # noqa: F811
    student_token = register_and_login(client, "async_test_student", "student")
    monkeypatch.setattr(
        "app.api.v1.tests.run_student_test_generation_task.apply_async",
        lambda args: None,
    )

    created = client.post(
        "/api/v1/student/tests/generate-async",
        json={
            "topic": "流式测验",
            "difficulty": "medium",
            "question_count": 5,
            "question_types": ["single_choice", "multiple_choice", "true_false", "short_answer"],
            "use_question_bank": False,
        },
        headers=auth(student_token),
    )
    assert created.status_code == 200, created.text
    task_data = created.json()["data"]
    assert task_data["task_type"] == "student_test_generation"
    assert task_data["status"] == "pending"
    assert task_data["stream_url"].endswith(f"/tasks/{task_data['task_id']}/stream")

    task = client.get(task_data["polling_url"], headers=auth(student_token))
    assert task.status_code == 200, task.text
    assert task.json()["data"]["task_type"] == "student_test_generation"
