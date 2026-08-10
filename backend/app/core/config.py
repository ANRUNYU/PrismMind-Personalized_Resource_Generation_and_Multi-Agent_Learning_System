from functools import lru_cache
import json
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "棱镜智教-PrismMind"
    app_version: str = "0.1.0"
    app_env: str = "development"
    app_debug: bool = False
    log_level: str = "INFO"

    api_v1_prefix: str = "/api/v1"
    request_id_header: str = "X-Request-ID"

    database_url: str = ""
    redis_url: str = ""
    celery_broker_url: str = ""
    celery_result_backend: str = ""
    use_celery: bool = False

    secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    backend_cors_methods: List[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    backend_cors_headers: List[str] = ["Authorization", "Content-Type", "X-Request-ID"]

    storage_root: str = "./storage/uploads"
    max_upload_size_mb: int = 20
    allowed_upload_extensions: str = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md"
    max_batch_upload_files: int = 20
    max_batch_upload_size_mb: int = 200
    ocr_enabled: bool = False
    ocr_language: str = "chi_sim+eng"
    pdf_text_min_chars: int = 20
    office_conversion_timeout_seconds: int = 60
    parse_stale_after_minutes: int = 30
    generation_reference_wait_seconds: int = 1800
    generation_reference_poll_seconds: float = 2.0
    chroma_persist_dir: str = "./storage/chroma"
    chroma_collection_name: str = "edugenie_knowledge"

    # Backward-compatible aliases from the phase-1 skeleton.
    storage_dir: str = "./storage"
    upload_max_size_mb: int = 20
    chroma_default_collection: str = "edugenie_knowledge"

    llm_provider: str = "mock"
    llm_model: str = "qwen-plus"
    llm_base_url: str = ""
    llm_timeout_seconds: int = 60
    llm_max_retries: int = 0
    llm_temperature: float = 0.3
    qa_v2_match_threshold: float = 0.34
    qa_v2_max_keypoints: int = 20
    qa_v2_max_generated_sections: int = 40
    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    openai_api_key: str = ""
    agent_model_orchestrator: str = "qwen3.7-plus"
    agent_model_profile: str = "qwen3.6-plus"
    agent_model_tutor: str = "qwen3-max"
    agent_model_resource: str = "qwen3-max"
    agent_model_test: str = "deepseek-v3"
    agent_model_path: str = "qwen3.7-plus"
    agent_model_assessment: str = "qwen3-max"
    agent_model_verifier: str = "qwen3.6-plus"
    agent_fallback_model_profile: str = "qwen3.7-plus"
    agent_fallback_model_test: str = "qwen3-max"
    agent_fallback_model_path: str = "qwen3-max"
    embedding_model: str = "text-embedding-v4"
    embedding_dimension: int = 1024
    embedding_provider: str = "dashscope"
    embedding_batch_size: int = 10
    embedding_timeout_seconds: float = 30.0
    embedding_max_retries: int = 2
    embedding_max_concurrency: int = 4
    chroma_collection_version: str = "te4_1024_v1"
    chroma_active_collection: str = "prismmind_knowledge_te4_1024_v1"
    chroma_legacy_collection: str = "edugenie_knowledge"
    rerank_model: str = "qwen3-rerank"
    rag_rerank_enabled: bool = True
    rag_candidate_k: int = 20
    rag_final_k: int = 5
    rag_min_top_similarity: float = 0.45
    rag_min_mean_similarity: float = 0.30
    rag_min_accepted_chunks: int = 1
    rag_rerank_timeout_seconds: float = 15.0
    rag_threshold_calibration_file: str = ""
    rag_cache_enabled: bool = True
    rag_cache_ttl_seconds: int = 300
    live_llm_tests: bool = False
    llm_request_timeout_seconds: int = 60
    llm_connect_timeout_seconds: int = 10
    llm_max_concurrency: int = 4
    llm_daily_token_budget: int = 1_000_000
    llm_per_run_token_budget: int = 32_000
    allow_mock_fallback: bool = False
    agent_enable_thinking_path: bool = True
    agent_enable_thinking_tutor: bool = False

    @property
    def backend_cors_origin_list(self) -> List[str]:
        raw = (self.backend_cors_origins or "").strip()
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if str(origin).strip()]
            except json.JSONDecodeError:
                pass
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]

    @property
    def project_root(self) -> Path:
        return BACKEND_DIR

    @property
    def storage_root_path(self) -> Path:
        path = Path(self.storage_root)
        if not path.is_absolute():
            path = BACKEND_DIR / path
        return path.resolve()

    @property
    def chroma_persist_path(self) -> Path:
        path = Path(self.chroma_persist_dir)
        if not path.is_absolute():
            path = BACKEND_DIR / path
        return path.resolve()

    @property
    def max_upload_size_bytes(self) -> int:
        return int((self.max_upload_size_mb or self.upload_max_size_mb) * 1024 * 1024)

    @property
    def max_batch_upload_size_bytes(self) -> int:
        return int(self.max_batch_upload_size_mb * 1024 * 1024)

    @property
    def allowed_upload_extension_set(self) -> set[str]:
        return {
            ext.strip().lower()
            for ext in self.allowed_upload_extensions.split(",")
            if ext.strip()
        }

    @property
    def chroma_collection(self) -> str:
        return self.chroma_active_collection


@lru_cache
def get_settings() -> Settings:
    return Settings()
