from app.services.quality_analysis_service import quality_analysis_service


def test_request_keyword_is_not_source_coverage_without_evidence():
    analysis = quality_analysis_service.analyze_generated_content(
        content="FastAPI 依赖注入教学设计", request_payload={"topic": "FastAPI"}, references=[],
    )
    assert analysis.analysis_version == "qa-v2"
    assert analysis.evidence_available is False
    assert analysis.source_coverage is None
    assert analysis.source_match_rate is None
    assert analysis.diagnostic_confidence is None


def test_semantic_evidence_match_records_chunk_and_generated_section():
    analysis = quality_analysis_service.analyze_generated_content(
        content="## 教学重点\n使用 FastAPI dependency injection 组织服务依赖。",
        request_payload={"topic": "请求中存在但证据不存在的词"},
        references=[{
            "source_type": "knowledge_chunk", "document_id": 8, "chunk_index": 2,
            "score": 0.08, "excerpt": "# Dependency injection\nFastAPI dependency injection 管理服务依赖。",
            "source_hash": "sha256:test",
        }],
    )
    assert analysis.evidence_available is True
    assert analysis.source_coverage is not None
    assert analysis.matched_keypoints
    match = analysis.matched_keypoints[0]
    assert match.evidence_chunk_id == "document:8:chunk:2"
    assert match.generated_section
    assert analysis.evidence_sources[0].source_hash == "sha256:test"
    assert "请求中存在但证据不存在的词" not in analysis.source_keypoints


def test_parse_warning_cannot_create_fake_scores():
    analysis = quality_analysis_service.analyze_generated_content(
        content="生成内容", references=[], warnings=["参考文件解析失败"],
    )
    assert analysis.evidence_available is False
    assert analysis.source_coverage is None
    assert "解析" in (analysis.unavailable_reason or "")


def test_quality_analysis_batches_keypoint_embeddings(monkeypatch):
    class TrackingEmbedding:
        def __init__(self):
            self.calls: list[list[str]] = []

        def embed_documents(self, texts):
            values = list(texts)
            self.calls.append(values)
            return [[1.0, 0.0] for _item in values]

    embedding = TrackingEmbedding()
    monkeypatch.setattr(
        "app.services.quality_analysis_service.get_embedding_provider",
        lambda: embedding,
    )
    analysis = quality_analysis_service.analyze_generated_content(
        content="链表用于组织线性数据。\n\n树结构用于表达层级关系。",
        references=[{
            "source_type": "knowledge_chunk",
            "document_id": 12,
            "chunk_index": 0,
            "similarity": 0.91,
            "excerpt": "# 数据结构\n链表组织线性数据，树结构表达层级关系。",
        }],
    )

    assert analysis.evidence_available is True
    assert len(embedding.calls) == 2
    assert len(embedding.calls[1]) == len(analysis.source_keypoints)
    assert analysis.evidence_sources[0].retrieval_similarity == 0.91
