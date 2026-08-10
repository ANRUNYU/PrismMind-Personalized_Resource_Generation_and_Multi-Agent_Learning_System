from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.models.enums import KnowledgeDocumentStatus, UserRole
from app.models.knowledge import KnowledgeDocument
from app.models.user import User
from app.services.embeddings.fake_embedding import FakeEmbeddingProvider
from app.services.knowledge.citations import label_general_supplement, validate_citations
from app.services.knowledge.models import EvidenceStatus, GroundingPolicy
from app.services.knowledge.service import KnowledgeAccessError, KnowledgeService


class FakeDb:
    def __init__(self, course, documents): self.course = course; self.documents = documents
    def get(self, model, identifier): return self.course if identifier == self.course.id else None
    def scalars(self, statement): return iter(self.documents)


def user(identifier: int, role: UserRole) -> User:
    return User(id=identifier, username=f"u{identifier}", email=f"u{identifier}@example.com", password_hash="x", role=role)


def document(identifier=10, owner_id=1, course_id=5):
    return KnowledgeDocument(id=identifier, owner_id=owner_id, course_id=course_id, file_asset_id=30,
                             title="doc", source_type="upload", status=KnowledgeDocumentStatus.ingested, chunk_count=1)


def settings(**overrides):
    values = dict(app_env="test", rag_rerank_enabled=False, rag_min_top_similarity=0.6,
                  rag_min_mean_similarity=0.5, rag_min_accepted_chunks=1, rag_candidate_k=20, rag_final_k=5)
    values.update(overrides)
    return Settings(**values)


def hit(similarity=.8, page=3):
    return {"content": "verified fact", "similarity": similarity, "distance": 1 - similarity, "metadata": {
        "document_id": 10, "file_id": 30, "source_filename": "lesson.pdf", "page_number": page,
        "slide_number": 0, "sheet_name": "", "heading_path": '["Chapter"]', "chunk_index": 2,
    }}


def service(monkeypatch, actor, docs, *, course_owner=1, membership=None, result=None, config=None, reranker=None):
    course = SimpleNamespace(id=5, owner_id=course_owner)
    db = FakeDb(course, docs)
    monkeypatch.setattr("app.services.knowledge.service.course_repository.get_active_membership", lambda *args: membership)
    monkeypatch.setattr("app.services.knowledge.service.query_chroma", lambda **kwargs: list(result if result is not None else [hit()]))
    return KnowledgeService(db, settings=config or settings(), embedding_provider=FakeEmbeddingProvider(), reranker=reranker)


def test_teacher_accesses_own_course(monkeypatch):
    actor = user(1, UserRole.teacher)
    pack = service(monkeypatch, actor, [document()]).retrieve_for_agent("tutor", actor, 5, "question")
    assert pack.status == EvidenceStatus.sufficient


def test_joined_student_accesses_shared_course(monkeypatch):
    actor = user(2, UserRole.student)
    membership = SimpleNamespace(status="active", role="student")
    pack = service(monkeypatch, actor, [document()], membership=membership).retrieve_for_agent("tutor", actor, 5, "question")
    assert pack.sources[0].source_filename == "lesson.pdf"


def test_unjoined_student_is_forbidden(monkeypatch):
    actor = user(2, UserRole.student)
    with pytest.raises(KnowledgeAccessError, match="未加入"):
        service(monkeypatch, actor, [document()]).retrieve_for_agent("tutor", actor, 5, "question")


def test_private_student_document_is_isolated(monkeypatch):
    actor = user(2, UserRole.student)
    private = document(owner_id=3, course_id=None)
    with pytest.raises(KnowledgeAccessError, match="私人"):
        service(monkeypatch, actor, [private]).retrieve_for_agent("tutor", actor, None, "question", document_ids=[10])


def test_strict_insufficient_blocks_generation(monkeypatch):
    actor = user(1, UserRole.teacher)
    pack = service(monkeypatch, actor, [document()], result=[hit(.2)]).retrieve_for_agent(
        "tutor", actor, 5, "question", policy=GroundingPolicy.STRICT)
    assert pack.status == EvidenceStatus.insufficient
    assert pack.may_generate is False
    assert pack.chunks == []


def test_general_supplement_requires_disclosure():
    with pytest.raises(ValueError):
        label_general_supplement("extra", allow_general_knowledge=False)
    assert label_general_supplement("extra", allow_general_knowledge=True).startswith("知识库外通用补充")


def test_invalid_citation_removed_and_real_page_returned(monkeypatch):
    actor = user(1, UserRole.teacher)
    pack = service(monkeypatch, actor, [document()]).retrieve_for_agent("tutor", actor, 5, "question")
    checked = validate_citations("Fact [S1], invented [S99].", pack)
    assert "[S99]" not in checked.content
    assert checked.citations[0].page_number == 3
    assert any("不存在" in warning for warning in checked.warnings)


def test_rerank_failure_falls_back_with_warning(monkeypatch):
    class BrokenReranker:
        def rerank(self, **kwargs): raise RuntimeError("offline")
    actor = user(1, UserRole.teacher)
    pack = service(monkeypatch, actor, [document()], config=settings(rag_rerank_enabled=True), reranker=BrokenReranker()).retrieve_for_agent("tutor", actor, 5, "question")
    assert pack.status == EvidenceStatus.sufficient
    assert any("Rerank unavailable" in warning for warning in pack.warnings)


def test_threshold_direction_is_higher_similarity_is_better(monkeypatch):
    actor = user(1, UserRole.teacher)
    low = service(monkeypatch, actor, [document()], result=[hit(.59)]).retrieve_for_agent("tutor", actor, 5, "q")
    high = service(monkeypatch, actor, [document()], result=[hit(.61)]).retrieve_for_agent("tutor", actor, 5, "q")
    assert low.status == EvidenceStatus.insufficient
    assert high.status == EvidenceStatus.sufficient


def test_uncalibrated_threshold_is_disclosed(monkeypatch):
    actor = user(1, UserRole.teacher)
    pack = service(monkeypatch, actor, [document()]).retrieve_for_agent("test", actor, 5, "q")
    assert pack.calibrated is False
    assert any("uncalibrated" in warning for warning in pack.warnings)
