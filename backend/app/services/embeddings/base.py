from __future__ import annotations

from abc import ABC, abstractmethod
from functools import lru_cache

from app.core.config import get_settings


class EmbeddingError(RuntimeError):
    pass


class EmbeddingProvider(ABC):
    model: str
    dimension: int

    @abstractmethod
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    @abstractmethod
    def embed_query(self, text: str) -> list[float]: ...


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    settings = get_settings()
    if settings.app_env == "test" or settings.embedding_provider == "fake":
        from app.services.embeddings.fake_embedding import FakeEmbeddingProvider
        return FakeEmbeddingProvider(model=settings.embedding_model, dimension=settings.embedding_dimension)
    from app.services.embeddings.dashscope_embedding import DashScopeEmbeddingProvider
    return DashScopeEmbeddingProvider(settings=settings)
