from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.models.enums import FileParseStatus
from app.services.documents.parser import ParsedBlock, ParsedDocument
from app.services.embeddings.base import EmbeddingError
from app.services.embeddings.dashscope_embedding import DashScopeEmbeddingProvider
from app.services.embeddings.fake_embedding import FakeEmbeddingProvider
from app.services.rag import chroma_store
from app.services.rag.ingestion import build_structured_chunks, ingest_document
from app.tasks import knowledge_tasks


def test_dashscope_uses_document_and_query_text_types(monkeypatch):
    calls = []
    class TextEmbedding:
        @staticmethod
        def call(**kwargs):
            calls.append(kwargs)
            embeddings = [{"text_index": index, "embedding": [0.0] * 1024} for index, _ in enumerate(kwargs["input"])]
            return SimpleNamespace(status_code=200, output={"embeddings": embeddings})
    monkeypatch.setitem(sys.modules, "dashscope", SimpleNamespace(TextEmbedding=TextEmbedding))
    provider = DashScopeEmbeddingProvider(settings=Settings(
        app_env="development", dashscope_api_key="secret", embedding_batch_size=2,
        embedding_dimension=1024, embedding_max_retries=0,
    ))
    assert len(provider.embed_documents(["a", "b", "c"])) == 3
    assert len(provider.embed_query("question")) == 1024
    assert [call["text_type"] for call in calls] == ["document", "document", "query"]
    assert all(call["dimension"] == 1024 for call in calls)


def test_fake_embedding_is_1024_and_records_distinct_intent():
    provider = FakeEmbeddingProvider(dimension=1024)
    assert len(provider.embed_documents(["文档"])[0]) == 1024
    assert len(provider.embed_query("问题")) == 1024
    assert [item[0] for item in provider.calls] == ["document", "query"]


def test_chroma_explicit_embeddings_and_similarity(monkeypatch):
    class Collection:
        def __init__(self): self.upsert_kwargs = None; self.query_kwargs = None
        def upsert(self, **kwargs): self.upsert_kwargs = kwargs
        def query(self, **kwargs):
            self.query_kwargs = kwargs
            return {"documents": [["hit"]], "metadatas": [[{"document_id": 1}]], "distances": [[0.2]]}
    collection = Collection()
    monkeypatch.setattr(chroma_store, "get_or_create_collection", lambda name=None: collection)
    chunk = chroma_store.ChromaChunk("id", "text", {"owner_id": 1}, [0.1] * 1024)
    chroma_store.upsert_chunks(chunks=[chunk], collection_name="prismmind_knowledge_te4_1024_v1")
    assert collection.upsert_kwargs["embeddings"] == [[0.1] * 1024]
    provider = FakeEmbeddingProvider(dimension=1024)
    result = chroma_store.query(query_text="q", owner_id=1, collection_name="new", embedding_provider=provider)
    assert "query_embeddings" in collection.query_kwargs and "query_texts" not in collection.query_kwargs
    assert result[0]["distance"] == pytest.approx(0.2)
    assert result[0]["similarity"] == pytest.approx(0.8)
    assert "score" not in result[0]


def test_default_collection_never_opens_legacy(monkeypatch, tmp_path):
    opened = []
    client = SimpleNamespace(get_or_create_collection=lambda **kwargs: opened.append(kwargs["name"]) or object())
    monkeypatch.setattr(chroma_store, "get_chroma_client", lambda: client)
    monkeypatch.setattr(chroma_store, "resolve_active_collection", lambda: "prismmind_knowledge_te4_1024_v1")
    chroma_store.get_or_create_collection()
    assert opened == ["prismmind_knowledge_te4_1024_v1"]
    assert "edugenie_knowledge" not in opened


def test_structured_chunk_metadata_keeps_pdf_and_slide_provenance():
    parsed = ParsedDocument(source_filename="mixed", blocks=[
        ParsedBlock("pdf text", page_number=2, source_filename="mixed", char_start=0, char_end=8),
        ParsedBlock("slide text", slide_number=4, source_filename="mixed", char_start=10, char_end=20),
    ])
    document = SimpleNamespace(id=7, owner_id=3, course_id=5)
    asset = SimpleNamespace(id=9, original_filename="mixed.pdf")
    chunks = build_structured_chunks(
        parsed=parsed, document=document, file_asset=asset, chunk_size=100, chunk_overlap=0,
        collection_version="te4_1024_v1", embedding_model="text-embedding-v4", embedding_dimension=1024,
    )
    assert chunks[0].metadata["page_number"] == 2
    assert chunks[1].metadata["slide_number"] == 4
    assert chunks[0].metadata["embedding_dimension"] == 1024
    assert chunks[0].metadata["content_hash"]


def test_embedding_failure_marks_document_and_file_failed(monkeypatch):
    statuses = []
    file_statuses = []
    class BrokenProvider(FakeEmbeddingProvider):
        def embed_documents(self, texts): raise EmbeddingError("service unavailable")
    monkeypatch.setattr("app.services.rag.ingestion.parse_document", lambda *args: ParsedDocument(
        [ParsedBlock("content", source_filename="a.txt", char_end=7)], "a.txt"))
    monkeypatch.setattr("app.services.rag.ingestion.get_file_path", lambda path: path)
    monkeypatch.setattr("app.services.rag.ingestion.knowledge_repository.update_document_status",
                        lambda db, **kwargs: statuses.append(kwargs["status"]))
    monkeypatch.setattr("app.services.rag.ingestion.knowledge_repository.delete_chunks_by_document", lambda *args: 0)
    monkeypatch.setattr("app.services.rag.ingestion.file_repository.update_parse_status",
                        lambda db, **kwargs: file_statuses.append(kwargs["parse_status"]))
    monkeypatch.setattr("app.services.rag.ingestion.delete_by_document_id", lambda **kwargs: None)
    document = SimpleNamespace(id=1, owner_id=2, course_id=None)
    asset = SimpleNamespace(id=3, original_filename="a.txt", storage_path="a.txt")
    with pytest.raises(EmbeddingError):
        ingest_document(SimpleNamespace(), document=document, file_asset=asset, embedding_provider=BrokenProvider())
    assert statuses[-1].value == "failed"
    assert file_statuses[-1] == FileParseStatus.failed


def test_reindex_checks_integrity_before_switch(monkeypatch):
    db = SimpleNamespace(close=lambda: None)
    document = SimpleNamespace(id=11, owner_id=2, file_asset_id=3)
    asset = SimpleNamespace(id=3)
    switches = []
    monkeypatch.setattr(knowledge_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(knowledge_tasks.knowledge_repository, "list_documents_for_reindex", lambda *args, **kwargs: [document])
    monkeypatch.setattr(knowledge_tasks.file_repository, "get_by_id", lambda *args: asset)
    monkeypatch.setattr(knowledge_tasks, "index_document", lambda **kwargs: (None, [SimpleNamespace(), SimpleNamespace()]))
    monkeypatch.setattr(knowledge_tasks, "count_by_document_id", lambda **kwargs: 1)
    monkeypatch.setattr(knowledge_tasks, "switch_active_collection", lambda target: switches.append(target))
    result = knowledge_tasks.reindex_knowledge_collection_task.run(target_collection="prismmind_test_v1")
    assert result["failed"][0]["document_id"] == 11
    assert result["switched"] is False
    assert switches == []


def test_reindex_is_repeatable_and_switches_only_complete_collection(monkeypatch):
    db = SimpleNamespace(close=lambda: None)
    document = SimpleNamespace(id=12, owner_id=2, file_asset_id=3)
    asset = SimpleNamespace(id=3)
    switches = []
    monkeypatch.setattr(knowledge_tasks, "SessionLocal", lambda: db)
    monkeypatch.setattr(knowledge_tasks.knowledge_repository, "list_documents_for_reindex", lambda *args, **kwargs: [document])
    monkeypatch.setattr(knowledge_tasks.file_repository, "get_by_id", lambda *args: asset)
    monkeypatch.setattr(knowledge_tasks, "index_document", lambda **kwargs: (None, [SimpleNamespace(), SimpleNamespace()]))
    monkeypatch.setattr(knowledge_tasks, "count_by_document_id", lambda **kwargs: 2)
    monkeypatch.setattr(knowledge_tasks, "switch_active_collection", lambda target: switches.append(target))
    first = knowledge_tasks.reindex_knowledge_collection_task.run(target_collection="prismmind_test_v1")
    second = knowledge_tasks.reindex_knowledge_collection_task.run(target_collection="prismmind_test_v1")
    assert first["failed"] == second["failed"] == []
    assert first["succeeded"] == second["succeeded"]
    assert switches == ["prismmind_test_v1", "prismmind_test_v1"]
