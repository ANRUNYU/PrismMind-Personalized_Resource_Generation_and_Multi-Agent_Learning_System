from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.core.exceptions import BadRequestException, ForbiddenException
from app.models.enums import FileParseStatus
from app.services.generation.question_generation_service import question_generation_service
from app.services.generation.reference_context_service import ReferenceContext, reference_context_service
from app.services.generation.teacher_generation_service import teacher_generation_service
from app.services.agents.test_agent import test_agent
from app.schemas.teacher_generation import CourseDesignGenerateRequest
from app.services.llm.base import LLMResponse, LLMUsage


def test_real_evidence_is_forwarded_to_shared_question_engine(monkeypatch):
    captured: dict[str, str] = {}

    def fake_structured(prompt, _schema):
        captured["prompt"] = prompt
        from app.services.agents.test_agent import GeneratedTestPayload
        return SimpleNamespace(parsed=GeneratedTestPayload.model_validate({
            "questions": [{
                "id": "q1", "question_type": "short_answer", "stem": "棱镜协议使用哪个端口？",
                "options": [], "knowledge_points": ["棱镜协议"], "answer": "4317",
                "analysis": "证据明确给出端口。", "keywords": ["4317"],
            }],
        }))

    monkeypatch.setattr("app.services.agents.test_agent.test_agent.legacy_structured", fake_structured)
    context = ReferenceContext(
        text="棱镜协议使用 4317 端口。",
        references=[{"source_type": "knowledge", "knowledge_document_id": 2, "chunk_id": 8, "reference_text": "棱镜协议使用 4317 端口。"}],
        evidence_snapshot={"source_document_ids": [2], "source_chunk_ids": [8]},
    )
    questions, answers = question_generation_service.generate(
        topic="棱镜协议", difficulty="medium", question_count=1,
        question_types=["short_answer"], knowledge_points=[],
        bank_questions=[SimpleNamespace(id=99)], reference_context=context,
    )
    assert "4317" in captured["prompt"]
    assert questions[0]["stem"]
    assert answers["q1"]["answer"] == "4317"


def test_reference_context_rejects_foreign_and_unparsed_files(monkeypatch):
    user = SimpleNamespace(id=1, role="student")
    foreign = SimpleNamespace(id=9, owner_id=2, parse_status=FileParseStatus.parsed)
    monkeypatch.setattr(
        "app.services.generation.reference_context_service.file_repository.get_accessible_file",
        lambda *_args, **_kwargs: (foreign, False),
    )
    with pytest.raises(ForbiddenException):
        reference_context_service.build(SimpleNamespace(), current_user=user, file_ids=[9])

    pending = SimpleNamespace(id=10, owner_id=1, original_filename="待解析.pdf", parse_status=FileParseStatus.pending, parse_error=None)
    monkeypatch.setattr(
        "app.services.generation.reference_context_service.file_repository.get_accessible_file",
        lambda *_args, **_kwargs: (pending, True),
    )
    with pytest.raises(BadRequestException):
        reference_context_service.build(SimpleNamespace(refresh=lambda _asset: None), current_user=user, file_ids=[10])


def test_teacher_service_uses_shared_question_service():
    from app.services.generation.teacher_generation_service import question_generation_service as teacher_shared
    assert teacher_shared is question_generation_service


def test_teacher_generation_waits_for_reference_parsing(monkeypatch):
    asset = SimpleNamespace(
        id=15,
        owner_id=7,
        original_filename="课程资料.pdf",
        parse_status=FileParseStatus.parsing,
        parse_error=None,
    )
    stages: list[tuple[str, str | None]] = []

    class FakeDb:
        @staticmethod
        def refresh(_asset):
            return None

    class FakeEmitter:
        @staticmethod
        def stage(stage, *, message=None, **_kwargs):
            stages.append((stage, message))

    async def finish_parsing(_seconds):
        asset.parse_status = FileParseStatus.parsed

    monkeypatch.setattr(
        "app.services.generation.teacher_generation_service.file_repository.get_accessible_file",
        lambda *_args, **_kwargs: (asset, True),
    )
    monkeypatch.setattr(
        "app.services.generation.teacher_generation_service.get_settings",
        lambda: SimpleNamespace(generation_reference_wait_seconds=30, generation_reference_poll_seconds=0),
    )
    monkeypatch.setattr("app.services.generation.teacher_generation_service.asyncio.sleep", finish_parsing)

    asyncio.run(
        teacher_generation_service.wait_for_reference_files(
            FakeDb(),
            current_user=SimpleNamespace(id=7),
            file_ids=[15],
            emitter=FakeEmitter(),
        )
    )

    assert stages
    assert stages[0][0] == "parsing_references"
    assert "课程资料.pdf" in (stages[0][1] or "")


def test_teacher_generation_reports_parse_failure_reason(monkeypatch):
    asset = SimpleNamespace(
        id=16,
        owner_id=7,
        original_filename="扫描课件.pdf",
        parse_status=FileParseStatus.failed,
        parse_error="OCR 识别失败，请确认文件是否清晰",
    )

    class FakeDb:
        @staticmethod
        def refresh(_asset):
            return None

    monkeypatch.setattr(
        "app.services.generation.teacher_generation_service.file_repository.get_accessible_file",
        lambda *_args, **_kwargs: (asset, True),
    )

    with pytest.raises(BadRequestException, match="OCR 识别失败"):
        asyncio.run(
            teacher_generation_service.wait_for_reference_files(
                FakeDb(),
                current_user=SimpleNamespace(id=7),
                file_ids=[16],
                emitter=SimpleNamespace(stage=lambda *_args, **_kwargs: None),
            )
        )


def test_teacher_generation_persists_structured_token_usage(monkeypatch):
    captured: dict = {}

    async def fake_chat(**_kwargs):
        return LLMResponse(
            content="# Course design",
            model="configured-model",
            provider="fake",
            usage=LLMUsage(prompt_tokens=11, completion_tokens=7, total_tokens=18),
        )

    monkeypatch.setattr(
        teacher_generation_service,
        "build_reference_context",
        lambda *_args, **_kwargs: SimpleNamespace(text="", summary={}, warnings=[], references=[]),
    )
    monkeypatch.setattr("app.services.generation.teacher_generation_service.router.chat", fake_chat)
    monkeypatch.setattr(
        "app.services.generation.teacher_generation_service.artifact_repository.create_artifact",
        lambda _db, **kwargs: captured.update(kwargs) or SimpleNamespace(id=1),
    )
    analysis = SimpleNamespace(model_dump=lambda **_kwargs: {})
    monkeypatch.setattr(
        "app.services.generation.teacher_generation_service.quality_analysis_service.analyze_generated_content",
        lambda **_kwargs: analysis,
    )
    monkeypatch.setattr(
        "app.services.generation.teacher_generation_service.artifact_repository.save_quality_analysis",
        lambda *_args, **_kwargs: None,
    )

    teacher_generation_service._generate(
        SimpleNamespace(),
        current_user=SimpleNamespace(id=7),
        prompt_key="course_design",
        artifact_type=SimpleNamespace(),
        title="Course design",
        payload=CourseDesignGenerateRequest(
            course_name="Networking",
            target_students="Undergraduates",
            total_hours=24,
            course_objectives="Build engineering competence",
        ),
        fallback="",
    )

    assert captured["token_usage"] == {
        "prompt_tokens": 11,
        "completion_tokens": 7,
        "total_tokens": 18,
    }


def test_objective_grading_does_not_wait_for_llm(monkeypatch):
    monkeypatch.setattr(
        test_agent,
        "_legacy_generate_json",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("grading must not call the LLM")),
    )
    result = test_agent.grade(
        questions=[{
            "id": "q1",
            "question_type": "single_choice",
            "stem": "Which answer is correct?",
            "options": [{"key": "A", "text": "A"}, {"key": "B", "text": "B"}],
            "knowledge_points": ["topic"],
            "score": 100,
        }],
        answers={"q1": {"answer": "A", "analysis": "Because A is correct", "keywords": []}},
        user_answers={"q1": "A"},
    )
    assert result["score"] == 100


def test_generated_test_schema_normalizes_common_provider_shape():
    from app.services.agents.test_agent import GeneratedTestPayload

    payload = GeneratedTestPayload.model_validate({
        "items": [{
            "id": "one",
            "type": "single_choice",
            "question": "Which option is correct?",
            "options": {"A": "Correct", "B": "Incorrect"},
            "explanation": "A matches the concept.",
        }],
        "answer_key": {"one": "A"},
    })
    assert payload.questions[0].stem == "Which option is correct?"
    assert payload.questions[0].answer == "A"
    assert payload.questions[0].options[0].key == "A"
