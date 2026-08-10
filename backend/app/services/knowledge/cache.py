from __future__ import annotations

import hashlib
import json

from app.core.config import Settings
from app.services.knowledge.models import EvidencePack


class KnowledgeCache:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = None

    def key(self, payload: dict) -> str:
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        return f"prismmind:knowledge:evidence:{digest}"

    def get(self, key: str) -> EvidencePack | None:
        if not self.settings.rag_cache_enabled or self.settings.app_env == "test":
            return None
        try:
            value = self._redis().get(key)
            return EvidencePack.model_validate_json(value) if value else None
        except Exception:
            return None

    def set(self, key: str, pack: EvidencePack) -> None:
        if not self.settings.rag_cache_enabled or self.settings.app_env == "test":
            return
        try:
            self._redis().setex(key, self.settings.rag_cache_ttl_seconds, pack.model_dump_json())
        except Exception:
            return

    def _redis(self):
        if self._client is None:
            from redis import Redis
            self._client = Redis.from_url(self.settings.redis_url, decode_responses=True, socket_timeout=1)
        return self._client
