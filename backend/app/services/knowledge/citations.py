from __future__ import annotations

import re

from app.services.knowledge.models import CitationValidationResult, EvidencePack


_CITATION = re.compile(r"\[S\d+\]")


def validate_citations(content: str, pack: EvidencePack) -> CitationValidationResult:
    source_map = {source.citation_id: source for source in pack.sources}
    warnings = list(pack.warnings)
    cited_ids: list[str] = []

    def replace(match: re.Match[str]) -> str:
        citation_id = match.group(0)[1:-1]
        if citation_id not in source_map:
            warnings.append(f"已删除不存在的引用 {match.group(0)}")
            return ""
        if citation_id not in cited_ids:
            cited_ids.append(citation_id)
        return match.group(0)

    cleaned = _CITATION.sub(replace, content)
    if pack.chunks and not cited_ids and len(cleaned.strip()) >= 40:
        warnings.append("重要内容未包含可验证的知识库引用")
    return CitationValidationResult(
        content=cleaned, citations=[source_map[item] for item in cited_ids],
        evidence_status=pack.status, warnings=list(dict.fromkeys(warnings)),
    )


def format_grounded_context(pack: EvidencePack) -> str:
    """Only stable IDs and source text enter the model context; filenames remain server-owned metadata."""
    return "\n\n".join(f"[{chunk.citation_id}]\n{chunk.content}" for chunk in pack.chunks)


def label_general_supplement(content: str, *, allow_general_knowledge: bool) -> str:
    if not allow_general_knowledge:
        raise ValueError("General-knowledge supplementation was not explicitly allowed")
    return f"知识库外通用补充：\n{content.strip()}"
