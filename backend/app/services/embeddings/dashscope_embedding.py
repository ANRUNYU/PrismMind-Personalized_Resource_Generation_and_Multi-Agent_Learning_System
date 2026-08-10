from __future__ import annotations

import threading
import time
from typing import Any

from app.core.config import Settings
from app.services.embeddings.base import EmbeddingError, EmbeddingProvider


class DashScopeEmbeddingProvider(EmbeddingProvider):
    def __init__(self, *, settings: Settings) -> None:
        self.settings = settings
        self.model = settings.embedding_model
        self.dimension = settings.embedding_dimension
        self.batch_size = settings.embedding_batch_size
        self._semaphore = threading.BoundedSemaphore(settings.embedding_max_concurrency)

    def _call(self, texts: list[str], *, text_type: str) -> list[list[float]]:
        if not self.settings.dashscope_api_key:
            raise EmbeddingError("DASHSCOPE_API_KEY is not configured")
        try:
            import dashscope
        except ImportError as exc:
            raise EmbeddingError("dashscope SDK is not installed") from exc
        last_error: Exception | None = None
        for attempt in range(self.settings.embedding_max_retries + 1):
            try:
                with self._semaphore:
                    response: Any = dashscope.TextEmbedding.call(
                        api_key=self.settings.dashscope_api_key,
                        model=self.model,
                        input=texts,
                        text_type=text_type,
                        dimension=self.dimension,
                        timeout=self.settings.embedding_timeout_seconds,
                    )
                status_code = int(getattr(response, "status_code", 500))
                if status_code != 200:
                    raise EmbeddingError(f"DashScope embedding request failed with status {status_code}")
                output = getattr(response, "output", None) or response.get("output", {})
                items = output.get("embeddings", [])
                vectors = [item["embedding"] for item in sorted(items, key=lambda item: item.get("text_index", 0))]
                if len(vectors) != len(texts) or any(len(vector) != self.dimension for vector in vectors):
                    raise EmbeddingError("DashScope returned an invalid embedding count or dimension")
                return vectors
            except Exception as exc:
                last_error = exc
                if attempt >= self.settings.embedding_max_retries:
                    break
                time.sleep(min(2 ** attempt * 0.25, 2.0))
        raise EmbeddingError(f"DashScope embedding failed after retries: {type(last_error).__name__}") from last_error

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for offset in range(0, len(texts), self.batch_size):
            vectors.extend(self._call(texts[offset: offset + self.batch_size], text_type="document"))
        return vectors

    def embed_query(self, text: str) -> list[float]:
        return self._call([text], text_type="query")[0]
