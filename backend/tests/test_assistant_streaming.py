from __future__ import annotations

import json

from test_course_flow import auth, client, register_and_login  # noqa: F401


def _events(response):
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def test_assistant_stream_emits_multiple_deltas_and_persists_history(client, monkeypatch):
    prompts: list[str] = []

    async def fake_stream(prompt: str, **kwargs):
        prompts.append(prompt)
        yield "第一段"
        yield "第二段"

    from app.services.llm.provider import LLMProvider
    monkeypatch.setattr(LLMProvider, "stream_supported", property(lambda self: True))
    monkeypatch.setattr("app.api.v1.assistant.llm_provider.stream_text", fake_stream)
    token = register_and_login(client, "assistant_stream_teacher", "teacher")
    session = client.post(
        "/api/v1/assistant/sessions", json={"mode": "general"}, headers=auth(token),
    ).json()["data"]

    response = client.post(
        f"/api/v1/assistant/sessions/{session['id']}/messages/stream",
        json={"message": "请解释依赖注入", "use_course_knowledge": False},
        headers=auth(token),
    )
    assert response.status_code == 200
    events = _events(response)
    assert [event["text"] for event in events if event["type"] == "delta"] == ["第一段", "第二段"]
    assert events[-1]["type"] == "done"

    history = client.get(f"/api/v1/assistant/sessions/{session['id']}", headers=auth(token)).json()["data"]
    assert history["messages"][-1]["content"] == "第一段第二段"
    assert history["messages"][-1]["status"] == "completed"

    client.post(
        f"/api/v1/assistant/sessions/{session['id']}/messages/stream",
        json={"message": "继续说明", "use_course_knowledge": False}, headers=auth(token),
    )
    assert "请解释依赖注入" in prompts[-1]
    assert "第一段第二段" in prompts[-1]


def test_assistant_stream_requires_bearer_token(client):
    response = client.post(
        "/api/v1/assistant/sessions/1/messages/stream",
        json={"message": "unauthorized"},
    )
    assert response.status_code == 401
