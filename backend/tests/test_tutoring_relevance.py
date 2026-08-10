from types import SimpleNamespace

from app.services.agents.tutoring_service import (
    GENERAL_KNOWLEDGE_DISCLOSURE,
    NO_KNOWLEDGE_FILES_DISCLOSURE,
)
from app.services.agents.tutor_agent import TutorAgentResult
from test_course_flow import auth, client, register_and_login  # noqa: F401


def test_sync_tutoring_answers_from_general_knowledge_without_fake_references(client, monkeypatch):
    token = register_and_login(client, "tutoring_relevance_none", "student")
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.knowledge_repository.list_ingested_documents_for_owner",
        lambda *_args, **_kwargs: [SimpleNamespace(id=7, owner_id=1)],
    )
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.retrieve",
        lambda **_kwargs: [
            {
                "content": "本章介绍机房配电、空调和综合布线。",
                "metadata": {"document_id": 7, "chunk_index": 2, "source_filename": "机房技术.pdf"},
                "similarity": 0.5168,
            }
        ],
    )

    captured = {}

    def answer_from_general_knowledge(**kwargs):
        captured.update(kwargs)
        return TutorAgentResult(content="微积分研究变化率与累积量。", model_name="test")

    monkeypatch.setattr(
        "app.services.agents.tutoring_service.tutor_agent.answer_question",
        answer_from_general_knowledge,
    )
    response = client.post(
        "/api/v1/student/tutoring/ask",
        headers=auth(token),
        json={"question": "什么是微积分？", "use_knowledge_base": True},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["answer"] == f"{GENERAL_KNOWLEDGE_DISCLOSURE}\n\n微积分研究变化率与累积量。"
    assert data["references"] == []
    assert data["warnings"] == []
    assert "不要拒绝回答" in captured["reference_context"]
    assert "不要要求学生再次确认" in captured["reference_context"]
    assert "不要编造具体教材页码" in captured["reference_context"]


def test_sync_tutoring_does_not_query_stale_vectors_when_no_files_exist(client, monkeypatch):
    token = register_and_login(client, "tutoring_no_files", "student")
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.knowledge_repository.list_ingested_documents_for_owner",
        lambda *_args, **_kwargs: [],
    )

    def unexpected_retrieve(**_kwargs):
        raise AssertionError("retrieve must not be called without a current knowledge document")

    monkeypatch.setattr("app.services.agents.tutoring_service.retrieve", unexpected_retrieve)
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.tutor_agent.answer_question",
        lambda **_kwargs: TutorAgentResult(content="高等数学复习可从极限开始。", model_name="test"),
    )

    response = client.post(
        "/api/v1/student/tutoring/ask",
        headers=auth(token),
        json={"question": "请制定高等数学复习方案", "use_knowledge_base": True},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["answer"] == f"{NO_KNOWLEDGE_FILES_DISCLOSURE}\n\n高等数学复习可从极限开始。"
    assert data["references"] == []


def test_sync_tutoring_keeps_only_relevant_chunks(client, monkeypatch):
    token = register_and_login(client, "tutoring_relevance_hit", "student")
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.knowledge_repository.list_ingested_documents_for_owner",
        lambda *_args, **_kwargs: [SimpleNamespace(id=7, owner_id=1)],
    )
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.retrieve",
        lambda **_kwargs: [
            {
                "content": "UPS 为机房服务器提供不间断电源，并支持旁路与电池供电。",
                "metadata": {"document_id": 7, "chunk_index": 3, "source_filename": "机房技术.pdf"},
                "similarity": 0.6578,
            },
            {
                "content": "与问题无关的低分片段。",
                "metadata": {"document_id": 7, "chunk_index": 9, "source_filename": "机房技术.pdf"},
                "similarity": 0.28,
            },
        ],
    )
    monkeypatch.setattr(
        "app.services.agents.tutoring_service.tutor_agent.answer_question",
        lambda **_kwargs: TutorAgentResult(content="UPS 是不间断电源。", model_name="test"),
    )
    response = client.post(
        "/api/v1/student/tutoring/ask",
        headers=auth(token),
        json={"question": "机房 UPS 有什么作用？", "use_knowledge_base": True},
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["answer"] == "UPS 是不间断电源。"
    assert len(data["references"]) == 1
    assert data["references"][0]["score"] == 0.6578
