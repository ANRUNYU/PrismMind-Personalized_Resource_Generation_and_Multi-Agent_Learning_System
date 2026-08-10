import json
from types import SimpleNamespace

from app.services.agents.tutoring_service import GENERAL_KNOWLEDGE_DISCLOSURE
from app.services.llm.provider import llm_provider
from test_course_flow import auth, client, register_and_login  # noqa: F401


def _create(client, token, title="数据结构辅导"):
    response = client.post("/api/v1/student/tutoring/conversations", headers=auth(token), json={"title": title})
    assert response.status_code == 200, response.text
    return response.json()["data"]


def _stream(client, token, conversation_id, content, key, retry=None, use_knowledge_base=False):
    response = client.post(f"/api/v1/student/tutoring/conversations/{conversation_id}/messages/stream", headers=auth(token), json={
        "content": content, "client_message_id": key, "retry_assistant_message_id": retry,
        "use_knowledge_base": use_knowledge_base,
    })
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def test_stream_emits_delta_before_done_and_uses_multiturn_context(client, monkeypatch):
    token = register_and_login(client, "tutoring_stream", "student")
    conversation = _create(client, token)
    prompts = []
    async def fake_stream(prompt, **kwargs):
        prompts.append(prompt)
        yield "# 回答\n"
        yield "- 第一点"
    monkeypatch.setattr(type(llm_provider), "stream_supported", property(lambda _: True))
    monkeypatch.setattr(llm_provider, "stream_text", fake_stream)
    first = _stream(client, token, conversation["id"], "什么是链表？", "q-1")
    assert [item["type"] for item in first].index("delta") < [item["type"] for item in first].index("done")
    second = _stream(client, token, conversation["id"], "它和数组有什么区别？", "q-2")
    assert second[-1]["type"] == "done"
    assert "什么是链表" in prompts[-1] and "# 回答" in prompts[-1]
    restored = client.get(f"/api/v1/student/tutoring/conversations/{conversation['id']}", headers=auth(token)).json()["data"]
    assert len(restored["messages"]) == 4
    assert restored["messages"][-1]["status"] == "completed"


def test_conversation_is_private_and_failure_is_retriable_without_duplicate_user(client, monkeypatch):
    owner = register_and_login(client, "tutoring_owner", "student")
    other = register_and_login(client, "tutoring_other", "student")
    conversation = _create(client, owner)
    forbidden = client.get(f"/api/v1/student/tutoring/conversations/{conversation['id']}", headers=auth(other))
    assert forbidden.status_code == 403
    async def broken(prompt, **kwargs):
        yield "已生成部分"
        raise RuntimeError("provider disconnected")
    monkeypatch.setattr(type(llm_provider), "stream_supported", property(lambda _: True))
    monkeypatch.setattr(llm_provider, "stream_text", broken)
    events = _stream(client, owner, conversation["id"], "解释二叉树", "same-question")
    assert events[-1]["type"] == "error"
    detail = client.get(f"/api/v1/student/tutoring/conversations/{conversation['id']}", headers=auth(owner)).json()["data"]
    failed = detail["messages"][-1]
    assert failed["status"] == "failed" and failed["content"] == "已生成部分"
    _stream(client, owner, conversation["id"], "解释二叉树", "same-question", failed["id"])
    detail = client.get(f"/api/v1/student/tutoring/conversations/{conversation['id']}", headers=auth(owner)).json()["data"]
    assert len([item for item in detail["messages"] if item["role"] == "user"]) == 1


def test_stream_answers_from_general_knowledge_without_references(client, monkeypatch):
    token = register_and_login(client, "tutoring_no_relevant_knowledge", "student")
    conversation = _create(client, token)
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.knowledge_repository.list_ingested_documents_for_owner",
        lambda *_args, **_kwargs: [SimpleNamespace(id=21, owner_id=1)],
    )
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.retrieve",
        lambda **_kwargs: [
            {
                "content": "机房供配电、空调与综合布线。",
                "metadata": {"document_id": 21, "chunk_index": 1, "source_filename": "机房技术.pdf"},
                "similarity": 0.31,
            }
        ],
    )

    prompts = []

    async def answer_from_general_knowledge(prompt, **_kwargs):
        prompts.append(prompt)
        yield "微积分研究变化率与累积量。"

    monkeypatch.setattr(type(llm_provider), "stream_supported", property(lambda _: True))
    monkeypatch.setattr(llm_provider, "stream_text", answer_from_general_knowledge)
    events = _stream(
        client, token, conversation["id"], "什么是微积分？", "no-hit", use_knowledge_base=True,
    )

    assert not [event for event in events if event["type"] == "reference"]
    assert [event.get("text") for event in events if event["type"] == "delta"] == [
        f"{GENERAL_KNOWLEDGE_DISCLOSURE}\n\n",
        "微积分研究变化率与累积量。",
    ]
    assert events[-1]["message"]["references"] == []
    assert events[-1]["message"]["content"].startswith(GENERAL_KNOWLEDGE_DISCLOSURE)
    assert "不要拒绝回答" in prompts[0]
