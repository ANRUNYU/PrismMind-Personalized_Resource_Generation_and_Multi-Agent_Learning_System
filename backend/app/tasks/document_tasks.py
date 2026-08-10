from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.enums import FileParseStatus
from app.repositories.file_repository import file_repository
from app.services.documents.parser import parse_document, parser_name_for_suffix
from app.services.documents.storage import get_file_path
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.document_tasks.parse_file_asset_task", bind=True, max_retries=2)
def parse_file_asset_task(self, file_id: int, force: bool = False) -> dict:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    db = SessionLocal()
    started = time.monotonic()
    suffix = ""
    parser_name = "unknown"
    try:
        file_asset = file_repository.get_by_id(db, file_id)
        if file_asset is None:
            raise RuntimeError(f"File asset {file_id} not found")
        suffix = Path(file_asset.original_filename).suffix.lower()
        parser_name = parser_name_for_suffix(suffix)
        if file_asset.parse_status == FileParseStatus.parsed and not force:
            return {"file_id": file_id, "status": "parsed", "idempotent": True}
        if file_asset.parse_status == FileParseStatus.parsing and not force:
            updated_at = file_asset.updated_at
            if updated_at and updated_at.tzinfo is None:
                updated_at = updated_at.replace(tzinfo=timezone.utc)
            stale_before = datetime.now(timezone.utc) - timedelta(minutes=get_settings().parse_stale_after_minutes)
            if updated_at and updated_at > stale_before:
                return {"file_id": file_id, "status": "parsing", "idempotent": True}
        file_repository.update_parse_status(db, file_id=file_id, parse_status=FileParseStatus.parsing)
        text = parse_document(get_file_path(file_asset.storage_path), suffix)
        file_repository.update_parse_status(
            db, file_id=file_id, parse_status=FileParseStatus.parsed, parsed_text_char_count=len(text)
        )
        logger.info("file_parse_succeeded file_id=%s suffix=%s parser=%s elapsed_ms=%s", file_id, suffix, parser_name, int((time.monotonic()-started)*1000))
        return {"file_id": file_id, "status": "parsed", "char_count": len(text)}
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        try:
            file_repository.update_parse_status(db, file_id=file_id, parse_status=FileParseStatus.failed, parse_error=message)
        except Exception:
            db.rollback()
        logger.exception("file_parse_failed file_id=%s suffix=%s parser=%s elapsed_ms=%s error_type=%s", file_id, suffix, parser_name, int((time.monotonic()-started)*1000), exc.__class__.__name__)
        raise
    finally:
        db.close()
