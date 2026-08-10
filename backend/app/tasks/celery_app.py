from __future__ import annotations

from celery import Celery

from app.core.config import get_settings


settings = get_settings()

broker_url = settings.celery_broker_url or settings.redis_url or "redis://127.0.0.1:6379/0"
result_backend = settings.celery_result_backend or settings.redis_url or broker_url

celery_app = Celery(
    "edugenie",
    broker=broker_url,
    backend=result_backend,
    include=[
        "app.tasks.generation_tasks",
        "app.tasks.knowledge_tasks",
        "app.tasks.document_tasks",
        "app.tasks.resource_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
    enable_utc=False,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
)
