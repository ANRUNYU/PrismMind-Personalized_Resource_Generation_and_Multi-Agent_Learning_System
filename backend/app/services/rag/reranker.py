from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import Settings, get_settings


class RerankError(RuntimeError):
    pass


@dataclass(frozen=True)
class RerankResult:
    index: int
    score: float


class DashScopeReranker:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.model = self.settings.rerank_model

    def rerank(self, *, query: str, documents: list[str], top_n: int) -> list[RerankResult]:
        if not self.settings.dashscope_api_key:
            raise RerankError("DASHSCOPE_API_KEY is not configured")
        try:
            import dashscope
            response: Any = dashscope.TextReRank.call(
                api_key=self.settings.dashscope_api_key, model=self.model, query=query,
                documents=documents, top_n=min(top_n, len(documents)), return_documents=False,
                timeout=self.settings.rag_rerank_timeout_seconds,
            )
            status_code = int(getattr(response, "status_code", 500))
            if status_code != 200:
                raise RerankError(f"rerank request failed with status {status_code}")
            output = getattr(response, "output", None) or response.get("output", {})
            return [RerankResult(index=int(item["index"]), score=float(item["relevance_score"])) for item in output.get("results", [])]
        except RerankError:
            raise
        except Exception as exc:
            raise RerankError(f"rerank failed: {type(exc).__name__}") from exc
