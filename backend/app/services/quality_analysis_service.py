from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from app.schemas.quality_analysis import EvidenceSource, KeypointMatch, QualityAnalysis
from app.services.embeddings.base import get_embedding_provider
from app.core.config import get_settings

QA_VERSION = "qa-v2"
QA_ALGORITHM = "configured-embedding-keypoints-v2"


class QualityAnalysisService:
    """Evidence-only diagnostics. Request fields never become source keypoints."""

    def analyze_generated_content(
        self,
        *,
        content: Any,
        references: list[Any] | None = None,
        warnings: list[str] | None = None,
        request_payload: dict[str, Any] | None = None,
        **_: Any,
    ) -> QualityAnalysis:
        warnings = list(warnings or [])
        sources = [source for item in (references or []) if (source := self._source(item)) is not None]
        if not sources:
            return QualityAnalysis(
                evidence_available=False,
                warnings=warnings,
                unavailable_reason=self._unavailable_reason(references, warnings),
                algorithm=self._algorithm_snapshot(),
            )

        keypoint_pairs = self._extract_keypoints(sources)
        if not keypoint_pairs:
            return QualityAnalysis(
                evidence_available=False, evidence_sources=sources,
                evidence_chunk_ids=self._chunk_ids(sources), warnings=warnings,
                unavailable_reason="实际证据中未能提取出可分析的关键点。",
                algorithm=self._algorithm_snapshot(),
            )
        sections = self._generated_sections(self._flatten_text(content))
        if not sections:
            return QualityAnalysis(
                evidence_available=False, evidence_sources=sources,
                evidence_chunk_ids=self._chunk_ids(sources), warnings=warnings,
                unavailable_reason="生成结果为空，无法与实际证据进行分析。",
                algorithm=self._algorithm_snapshot(),
            )

        embedder = get_embedding_provider()
        section_vectors = embedder.embed_documents(sections)
        keypoint_vectors = embedder.embed_documents([keypoint for keypoint, _chunk_id in keypoint_pairs])
        matches: list[KeypointMatch] = []
        missing: list[str] = []
        all_best_scores: list[float] = []
        for (keypoint, chunk_id), vector in zip(keypoint_pairs, keypoint_vectors, strict=True):
            scores = [self._cosine(vector, candidate) for candidate in section_vectors]
            best_index = max(range(len(scores)), key=scores.__getitem__)
            best_score = scores[best_index]
            all_best_scores.append(best_score)
            if best_score >= get_settings().qa_v2_match_threshold:
                matches.append(KeypointMatch(
                    keypoint=keypoint, evidence_chunk_id=chunk_id,
                    generated_section=sections[best_index][:500], similarity=round(best_score, 4),
                ))
            else:
                missing.append(keypoint)

        coverage = len(matches) / len(keypoint_pairs)
        match_rate = sum(all_best_scores) / len(all_best_scores)
        completeness = min(1.0, len(sources) / 5)
        provenance = sum(1 for source in sources if source.chunk_id or source.file_id) / len(sources)
        warning_factor = max(0.0, 1.0 - 0.15 * len(warnings))
        extraction_factor = min(1.0, len(keypoint_pairs) / 8)
        confidence = 0.35 * completeness + 0.30 * provenance + 0.20 * warning_factor + 0.15 * extraction_factor
        return QualityAnalysis(
            evidence_available=True,
            evidence_sources=sources,
            evidence_chunk_ids=self._chunk_ids(sources),
            source_keypoints=[item[0] for item in keypoint_pairs],
            matched_keypoints=matches,
            missing_keypoints=missing,
            source_coverage=round(coverage, 4),
            source_match_rate=round(match_rate, 4),
            diagnostic_confidence=round(confidence, 4),
            warnings=warnings,
            algorithm=self._algorithm_snapshot(),
        )

    def _source(self, item: Any) -> EvidenceSource | None:
        data = item if isinstance(item, dict) else getattr(item, "__dict__", {})
        text = str(data.get("reference_text") or data.get("excerpt") or "").strip()
        if not text:
            return None
        document_id = data.get("knowledge_document_id") or data.get("document_id")
        chunk_value = data.get("chunk_id")
        if chunk_value is None and data.get("chunk_index") is not None:
            chunk_value = f"document:{document_id or '-'}:chunk:{data['chunk_index']}"
        return EvidenceSource(
            source_type=str(data.get("source_type") or "unknown"), file_id=data.get("file_id"),
            knowledge_document_id=document_id, chunk_id=str(chunk_value) if chunk_value is not None else None,
            source_hash=data.get("source_hash"), source_version=data.get("source_version"),
            retrieval_similarity=self._retrieval_similarity(data),
            reference_text=text,
        )

    def _extract_keypoints(self, sources: list[EvidenceSource]) -> list[tuple[str, str]]:
        candidates: list[tuple[str, str, int]] = []
        for source in sources:
            chunk_id = source.chunk_id or f"file:{source.file_id or '-'}"
            text = source.reference_text
            for heading in re.findall(r"(?m)^\s{0,3}#{1,6}\s+(.+)$", text):
                clean = self._clean(heading)
                if clean:
                    candidates.append((clean, chunk_id, 100))
            terms = re.findall(r"[A-Za-z][A-Za-z0-9_+.-]{2,}|[\u4e00-\u9fff]{2,10}", text)
            counts = Counter(self._clean(term) for term in terms)
            for term, count in counts.most_common(12):
                if term and term not in {"进行", "可以", "通过", "以及", "内容", "课程", "学生", "学习"}:
                    candidates.append((term, chunk_id, count))
        candidates.sort(key=lambda item: (-item[2], item[0]))
        seen: set[str] = set()
        result: list[tuple[str, str]] = []
        for term, chunk_id, _weight in candidates:
            key = term.lower()
            if key in seen:
                continue
            seen.add(key)
            result.append((term, chunk_id))
            if len(result) >= get_settings().qa_v2_max_keypoints:
                break
        return result

    def _generated_sections(self, text: str) -> list[str]:
        return [part.strip() for part in re.split(r"\n\s*\n|^#{1,6}\s+", text, flags=re.MULTILINE) if len(part.strip()) >= 2][:get_settings().qa_v2_max_generated_sections]

    def _unavailable_reason(self, references: list[Any] | None, warnings: list[str]) -> str:
        if warnings:
            return "本次生成没有可用的知识库证据；参考资料解析或检索未成功。"
        if references:
            return "本次传入模型的证据文本为空，无法计算来源覆盖率与匹配度。"
        return "本次生成没有选择或检索到可用的知识库证据。"

    def _algorithm_snapshot(self) -> dict[str, Any]:
        settings = get_settings()
        return {"version": QA_ALGORITHM, "match_threshold": settings.qa_v2_match_threshold, "max_keypoints": settings.qa_v2_max_keypoints}

    def _chunk_ids(self, sources: list[EvidenceSource]) -> list[str]:
        return list(dict.fromkeys(source.chunk_id for source in sources if source.chunk_id))

    def _retrieval_similarity(self, data: dict[str, Any]) -> float | None:
        if data.get("retrieval_similarity") is not None:
            return self._bounded_score(data["retrieval_similarity"])
        if data.get("similarity") is not None:
            return self._bounded_score(data["similarity"])
        value = data.get("score")
        if value is None:
            return None
        score = float(value)
        return round(max(0.0, min(1.0, 1.0 - score)), 4)

    def _bounded_score(self, value: Any) -> float:
        return round(max(0.0, min(1.0, float(value))), 4)

    def _cosine(self, left: list[float], right: list[float]) -> float:
        dot = sum(a * b for a, b in zip(left, right))
        norms = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
        return max(0.0, min(1.0, dot / norms if norms else 0.0))

    def _clean(self, value: str) -> str:
        return re.sub(r"\s+", " ", value).strip(" -_.,，。；;：:#")

    def _flatten_text(self, value: Any) -> str:
        if isinstance(value, dict):
            return "\n".join(self._flatten_text(item) for item in value.values())
        if isinstance(value, (list, tuple)):
            return "\n".join(self._flatten_text(item) for item in value)
        return "" if value is None else str(value)


quality_analysis_service = QualityAnalysisService()
