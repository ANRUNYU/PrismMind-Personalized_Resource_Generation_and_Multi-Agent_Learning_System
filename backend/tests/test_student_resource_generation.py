from __future__ import annotations

from app.models.profile import StudentProfile
from app.models.resource import LearningResource
from app.services.agents.resource_agent import RESOURCE_TYPE_TITLES, resource_agent
from app.services.generation.student_generation_service import student_generation_service


def test_profile_snapshot_contains_personalization_evidence():
    profile = StudentProfile(
        user_id=1,
        learning_goal="考研 408",
        knowledge_score=42,
        practice_score=76,
        innovation_score=55,
        exam_score=73,
        efficiency_score=48,
        quality_score=64,
        profile_data={
            "current_course": "数据结构",
            "weaknesses": ["链表", "树"],
            "preferred_style": "示例与练习",
        },
    )
    snapshot = student_generation_service._profile_snapshot(profile)
    assert snapshot is not None
    assert snapshot["learning_goal"] == "考研 408"
    assert snapshot["course"] == "数据结构"
    assert snapshot["weaknesses"] == ["链表", "树"]
    assert snapshot["dimension_scores"]["knowledge_score"] == 42
    assert snapshot["personalization_strategies"]


def test_partial_profile_snapshot_uses_topic_scores_and_real_study_evidence():
    profile = StudentProfile(
        user_id=1,
        learning_goal="考研",
        knowledge_score=38,
        practice_score=61,
        innovation_score=57,
        exam_score=72,
        efficiency_score=45,
        quality_score=66,
        profile_data={"quality_evidence": "我习惯先看示例，再做题并整理错题。"},
    )

    snapshot = student_generation_service._profile_snapshot(profile, topic="网络工程")

    assert snapshot is not None
    assert snapshot["course"] == "网络工程"
    assert snapshot["learning_preferences"] == "我习惯先看示例，再做题并整理错题。"
    assert snapshot["development_focus"] == ["知识基础（38 分）", "学习效率（45 分）"]
    assert any("六维画像" in strategy for strategy in snapshot["personalization_strategies"])


def test_learning_resource_exposes_generation_snapshots():
    resource = LearningResource(
        user_id=1, resource_type="summary_notes", title="数据结构", content="# 标题",
        profile_snapshot={"learning_goal": "复习"}, reference_snapshot=[{"document_id": 2}],
        quality_analysis={"analysis_version": "qa-v2", "evidence_available": True},
        generation_task_id=9, generation_parameters={"topic": "数据结构"},
    )
    assert resource.generation_task_id == 9
    assert resource.reference_snapshot[0]["document_id"] == 2


def test_resource_agent_forwards_real_stream_chunks(monkeypatch):
    chunks = ["# 标题\n", "- 第一项\n", "- 第二项"]

    async def fake_stream(*args, **kwargs):
        for chunk in chunks:
            from app.services.llm.base import LLMStreamChunk, StreamChunkType
            yield LLMStreamChunk(type=StreamChunkType.delta, delta=chunk)

    monkeypatch.setattr(resource_agent.router, "stream_chat", fake_stream)
    received: list[str] = []
    result = resource_agent.generate_single_resource(
        topic="数据结构", resource_type="summary_notes", difficulty="normal",
        knowledge_points=None, profile_context="", reference_context="",
        additional_requirements=None, on_delta=received.append,
    )
    assert received == chunks
    assert result.content == "".join(chunks)


def test_external_resource_types_have_distinct_titles_and_structures():
    expected = {
        "course_document": "课程文档",
        "mind_map": "思维导图",
        "further_reading": "拓展阅读",
        "video_script": "视频脚本",
        "code_example": "代码案例",
    }
    for resource_type, title in expected.items():
        assert RESOURCE_TYPE_TITLES[resource_type] == title
        content = resource_agent.build_mock_resource(
            topic="数据结构",
            resource_type=resource_type,
            difficulty="normal",
            knowledge_points=None,
            profile_context="",
            reference_context="",
        )
        assert content.startswith(f"# 数据结构{title}")
