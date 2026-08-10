from __future__ import annotations

import hashlib
import math
import re

from app.services.embeddings.base import EmbeddingProvider


class FakeEmbeddingProvider(EmbeddingProvider):
    """Deterministic CI embedding with the configured production dimension."""

    def __init__(self, *, model: str = "fake-text-embedding-v4", dimension: int = 1024) -> None:
        self.model = model
        self.dimension = dimension
        self.calls: list[tuple[str, list[str]]] = []

    def _embed(self, text: str, text_type: str) -> list[float]:
        vector = [0.0] * self.dimension
        for token in re.findall(r"[\w]+", text.lower()) or [text]:
            digest = hashlib.sha256(f"{text_type}:{token}".encode()).digest()
            vector[int.from_bytes(digest[:4], "big") % self.dimension] += 3.0
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(("document", list(texts)))
        return [self._embed(text, "document") for text in texts]

    def embed_query(self, text: str) -> list[float]:
        self.calls.append(("query", [text]))
        # Keep query/document vectors in the same semantic space while recording distinct API intent.
        return self._embed(text, "document")
