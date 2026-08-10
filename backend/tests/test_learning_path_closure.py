from test_course_flow import auth, client, register_and_login  # noqa: F401

from app.api.v1 import learning_paths as learning_paths_api
from app.services.agents.path_agent import PATH_MODEL_REQUEST_TIMEOUT_SECONDS, PathPlanningAgent
from app.repositories.learning_path_repository import LearningPathRepository
from app.services.generation.reference_context_service import ReferenceContext


def _create_path(client, token):
    response = client.post("/api/v1/student/learning-paths", headers=auth(token), json={
        "topic": "数据结构", "target_goal": "掌握核心结构", "knowledge_points": ["链表", "树"],
        "duration_days": 7, "daily_minutes": 45, "difficulty": "normal",
        "use_profile": False, "use_existing_resources": False,
    })
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_path_requires_learning_and_passing_test_before_unlock(client):
    token = register_and_login(client, "path_closure", "student")
    path = _create_path(client, token)
    first, second = path["path_steps"][:2]
    assert first["status"] == "active" and second["status"] == "locked"

    blocked = client.post(f"/api/v1/student/learning-paths/{path['id']}/quiz", headers=auth(token), json={
        "step_index": 0, "question_count": 3, "difficulty": "normal",
    })
    assert blocked.status_code == 400
    legacy_advance = client.post(f"/api/v1/student/learning-paths/{path['id']}/advance", headers=auth(token), json={"completed_step_index": 0})
    assert legacy_advance.status_code == 400

    studied = client.post(f"/api/v1/student/learning-paths/{path['id']}/steps/{first['id']}/complete-learning", headers=auth(token), json={})
    assert studied.status_code == 200
    quiz = client.post(f"/api/v1/student/learning-paths/{path['id']}/quiz", headers=auth(token), json={
        "step_index": 0, "question_count": 3, "difficulty": "normal",
    })
    assert quiz.status_code == 200, quiz.text
    test_id = quiz.json()["data"]["test_id"]
    listed = client.get("/api/v1/student/tests", headers=auth(token)).json()["data"]["items"]
    assert any(item["id"] == test_id and item["learning_path_step_id"] == first["id"] for item in listed)

    failed = client.post(f"/api/v1/student/tests/{test_id}/submit", headers=auth(token), json={"user_answers": {}})
    assert failed.status_code == 200
    after_fail = client.get(f"/api/v1/student/learning-paths/{path['id']}", headers=auth(token)).json()["data"]
    assert after_fail["path_steps"][0]["status"] == "quiz_required"
    assert after_fail["path_steps"][1]["status"] == "locked"

    retry = client.post(f"/api/v1/student/learning-paths/{path['id']}/quiz", headers=auth(token), json={
        "step_index": 0, "question_count": 3, "difficulty": "normal",
    }).json()["data"]["test_id"]
    first_detail = client.get(f"/api/v1/student/tests/{test_id}", headers=auth(token)).json()["data"]
    correct = {key: value["answer"] for key, value in first_detail["answers"].items()}
    passed = client.post(f"/api/v1/student/tests/{retry}/submit", headers=auth(token), json={"user_answers": correct})
    assert passed.status_code == 200, passed.text
    duplicate = client.post(f"/api/v1/student/tests/{retry}/submit", headers=auth(token), json={"user_answers": correct})
    assert duplicate.status_code == 200
    after_pass = client.get(f"/api/v1/student/learning-paths/{path['id']}", headers=auth(token)).json()["data"]
    assert after_pass["path_steps"][0]["status"] == "completed"
    assert after_pass["path_steps"][1]["status"] == "active"


def test_path_agent_creates_distinct_times_and_final_cumulative_test(client):
    token = register_and_login(client, "path_distinct", "student")
    path = _create_path(client, token)
    steps = path["path_steps"]
    assert len({step["estimated_minutes"] for step in steps}) > 1
    assert "综合" in steps[-1]["title"]
    assert len(steps[-1]["knowledge_points"]) == 1  # normalized row names the cumulative final step
    assert len({step["title"] for step in steps}) == len(steps)


def test_path_generation_uses_student_selected_knowledge_documents(client, monkeypatch):
    token = register_and_login(client, "path_knowledge_sources", "student")
    captured = {}

    def fake_build(db, **kwargs):
        captured.update(kwargs)
        return ReferenceContext(
            text="[document:17] 学生自主选择的知识库内容",
            evidence_snapshot={"source_document_ids": [17]},
        )

    monkeypatch.setattr(learning_paths_api.reference_context_service, "build", fake_build)
    response = client.post("/api/v1/student/learning-paths", headers=auth(token), json={
        "topic": "操作系统",
        "target_goal": "掌握进程调度",
        "duration_days": 7,
        "daily_minutes": 45,
        "difficulty": "normal",
        "use_profile": False,
        "use_existing_resources": False,
        "use_knowledge_base": True,
        "knowledge_document_ids": [17],
        "top_k": 6,
    })

    assert response.status_code == 200, response.text
    assert captured["knowledge_document_ids"] == [17]
    assert captured["use_knowledge_base"] is True
    assert captured["top_k"] == 6


def test_path_generation_falls_back_when_model_times_out(monkeypatch):
    agent = PathPlanningAgent()
    captured = {}

    def timeout(*_args, **kwargs):
        captured.update(kwargs)
        raise TimeoutError("model timed out")

    monkeypatch.setattr(agent, "legacy_structured", timeout)
    generated = agent.generate_learning_path(
        title="数据结构学习路径",
        topic="数据结构",
        course_id=None,
        target_goal="掌握数据结构基础",
        knowledge_points=["链表", "树"],
        duration_days=7,
        daily_minutes=45,
        difficulty="normal",
        profile=None,
        resources=[],
        knowledge_context="",
        additional_requirements=None,
    )

    assert generated["generation_mode"] == "deterministic_fallback"
    assert len(generated["path_steps"]) >= 2
    assert generated["path_steps"][-1]["title"].startswith("综合")
    assert captured["timeout"] == PATH_MODEL_REQUEST_TIMEOUT_SECONDS


def test_path_fallback_generates_concrete_domain_knowledge(monkeypatch):
    agent = PathPlanningAgent()

    def timeout(*_args, **_kwargs):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr(agent, "legacy_structured", timeout)
    generated = agent.generate_learning_path(
        title="机房技术学习路径",
        topic="机房技术",
        course_id=None,
        target_goal="能够完成机房巡检与基础故障处理",
        knowledge_points=[],
        duration_days=14,
        daily_minutes=45,
        difficulty="normal",
        profile=None,
        resources=[],
        knowledge_context="",
        additional_requirements=None,
    )

    steps = generated["path_steps"]
    points = [step["knowledge_points"][0] for step in steps[:-1]]
    assert "市电、UPS、蓄电池与PDU供电链路" in points
    assert "精密空调、冷热通道与温湿度控制" in points
    assert "阅读或观看" not in " ".join(step["learning_activity"] for step in steps)
    assert all(len(step["learning_activity"]) >= 60 for step in steps)
    assert steps[-1]["knowledge_point"] == "机房技术综合应用"


def test_path_fallback_prefers_selected_knowledge_context(monkeypatch):
    agent = PathPlanningAgent()

    def timeout(*_args, **_kwargs):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr(agent, "legacy_structured", timeout)
    generated = agent.generate_learning_path(
        title="操作系统学习路径",
        topic="操作系统",
        course_id=None,
        target_goal="掌握进程管理",
        knowledge_points=[],
        duration_days=7,
        daily_minutes=45,
        difficulty="normal",
        profile=None,
        resources=[],
        knowledge_context="# 进程状态转换\n进程在运行态、就绪态和阻塞态之间转换。\n# 时间片轮转调度\n时间片轮转用于共享处理器时间。",
        additional_requirements=None,
    )

    points = [step["knowledge_points"][0] for step in generated["path_steps"][:-1]]
    assert points[:2] == ["进程状态转换", "时间片轮转调度"]


def test_materialized_step_keeps_practice_and_completion_details():
    description = LearningPathRepository._step_description({
        "learning_activity": "学习 UPS 的在线、旁路和电池三种状态。",
        "practice_task": "绘制供电链路并标出单点故障。",
        "completion_criteria": "能够解释市电中断后的切换过程。",
    })

    assert "实践任务：绘制供电链路" in description
    assert "完成标准：能够解释市电中断" in description
