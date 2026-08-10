from test_course_flow import auth, client, register_and_login  # noqa: F401


def _start(client, token):
    response = client.get("/api/v1/student/profile/onboarding", headers=auth(token))
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _answer(client, token, state, answer, key):
    response = client.post("/api/v1/student/profile/onboarding/messages", headers=auth(token), json={
        "conversation_id": state["conversation_id"], "answer": answer, "idempotency_key": key,
    })
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_onboarding_extracts_identity_updates_each_dimension_and_recovers(client):
    token = register_and_login(client, "profile_onboarding", "student")
    state = _start(client, token)
    assert state["current_step"] == "identity"
    state = _answer(client, token, state, "大三，计算机专业，考研408，现在学数据结构", "profile-onboarding-identity")
    profile = state["current_profile"]
    assert profile["grade"] == "大三"
    assert profile["major"] == "计算机专业"
    assert "考研408" in profile["learning_goal"]
    assert state["current_step"] == "knowledge"

    before = profile["knowledge_score"]
    state = _answer(client, token, state, "C语言会一点，链表和树不会，正在按章节复习。", "profile-onboarding-knowledge")
    assert state["changed_dimensions"] == ["knowledge_score"]
    assert state["current_profile"]["knowledge_score"] != before
    recovered = _start(client, token)
    assert recovered["conversation_id"] == state["conversation_id"]
    assert recovered["current_step"] == "practice"
    assert any(item["answer"] == "C语言会一点，链表和树不会，正在按章节复习。" for item in recovered["messages"])

    duplicate = _answer(client, token, state, "不会再次应用", "profile-onboarding-knowledge")
    assert duplicate["duplicate"] is True
    assert duplicate["current_profile"]["knowledge_score"] == state["current_profile"]["knowledge_score"]


def test_known_major_is_not_asked_and_seven_rounds_finish(client):
    token = register_and_login(client, "profile_known_major", "student")
    created = client.post("/api/v1/student/profile", headers=auth(token), json={"major": "软件工程"})
    assert created.status_code == 200
    state = _start(client, token)
    assert "专业" not in state["current_question"]
    answers = [
        "大二，准备就业", "学过基础语法，算法还不熟", "做过课程实验和一个小项目",
        "先搜索资料，再做最小实验验证", "每周刷题，选择题容易失分", "每天两小时，手机容易让我分心",
        "每周复习笔记，并尝试给同学讲解",
    ]
    for index, answer in enumerate(answers):
        state = _answer(client, token, state, answer, f"known-major-step-{index}")
    assert state["status"] == "completed"
    assert state["current_step"] == "summary"
    assert state["current_profile"]["is_complete"] is True
    continuous = _start(client, token)
    assert continuous["mode"] == "continuous"
    assert continuous["current_step"] == "continuous"
    score_fields = (
        "knowledge_score", "practice_score", "innovation_score",
        "exam_score", "efficiency_score", "quality_score",
    )
    scores_before = {field: continuous["current_profile"][field] for field in score_fields}
    updated_at_before = continuous["current_profile"]["updated_at"]
    continuous = _answer(client, token, continuous, "请分析我的学习能力和六维分数", "continuous-profile-analysis")
    assert continuous["mode"] == "continuous"
    assert continuous["status"] == "active"
    assert continuous["current_profile"]["is_complete"] is True
    assert {field: continuous["current_profile"][field] for field in score_fields} == scores_before
    assert continuous["current_profile"]["updated_at"] == updated_at_before
    assert continuous["changed_fields"] == []
    assert continuous["changed_dimensions"] == []
    assert continuous["messages"][-1]["role"] == "assistant"
    assert "Onboarding has already completed" not in continuous["messages"][-1]["content"]


def test_profile_conversations_are_user_isolated(client):
    first = register_and_login(client, "profile_isolated_a", "student")
    second = register_and_login(client, "profile_isolated_b", "student")
    first_state = _start(client, first)
    second_state = _start(client, second)
    assert first_state["conversation_id"] != second_state["conversation_id"]
    forbidden = client.get(f"/api/v1/student/profile/conversations/{first_state['conversation_id']}", headers=auth(second))
    assert forbidden.status_code == 404


def test_profile_event_uses_bounded_ema_and_is_idempotent(client):
    token = register_and_login(client, "profile_event", "student")
    state = _start(client, token)
    payload = {"idempotency_key": "test-completed-1001", "source_type": "test_completed", "source_id": "1001",
        "reason": "测试完成", "evidence": {"score": 80}, "dimension": "exam_score", "observed_score": 80}
    first = client.post("/api/v1/student/profile/events", headers=auth(token), json=payload)
    second = client.post("/api/v1/student/profile/events", headers=auth(token), json=payload)
    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    after = first.json()["data"]["after"]["scores"]["exam_score"]
    assert 0 <= after <= 100
