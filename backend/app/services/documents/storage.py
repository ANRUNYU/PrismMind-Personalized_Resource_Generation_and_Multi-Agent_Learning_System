from __future__ import annotations

import hashlib
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings


@dataclass(frozen=True)
class StoredFile:
    original_filename: str
    storage_path: str
    absolute_path: Path
    content_type: str | None
    file_size: int
    file_hash: str


class LocalStorageProvider:
    def __init__(self, root: Path | None = None) -> None:
        settings = get_settings()
        self.root = (root or settings.storage_root_path).resolve()

    def ensure_safe_path(self, path: Path) -> Path:
        resolved = path.resolve()
        if not resolved.is_relative_to(self.root):
            raise ValueError("Resolved path is outside storage root")
        return resolved

    def get_file_path(self, storage_path: str) -> Path:
        return self.ensure_safe_path(self.root / storage_path)

    async def save_upload_file(
        self,
        upload_file: UploadFile,
        *,
        max_size_bytes: int | None = None,
    ) -> StoredFile:
        original_filename = Path(upload_file.filename or "").name
        suffix = Path(original_filename).suffix.lower()
        now = datetime.utcnow()
        relative_dir = Path(f"{now:%Y}") / f"{now:%m}"
        storage_name = f"{uuid4().hex}{suffix}"
        target_dir = self.ensure_safe_path(self.root / relative_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = self.ensure_safe_path(target_dir / storage_name)

        sha256 = hashlib.sha256()
        total_size = 0
        chunk_size = 1024 * 1024

        try:
            with target_path.open("wb") as output:
                while True:
                    chunk = await upload_file.read(chunk_size)
                    if not chunk:
                        break
                    total_size += len(chunk)
                    if max_size_bytes is not None and total_size > max_size_bytes:
                        output.close()
                        target_path.unlink(missing_ok=True)
                        raise ValueError("上传文件超过大小限制")
                    sha256.update(chunk)
                    output.write(chunk)
        finally:
            await upload_file.close()

        relative_path = (relative_dir / storage_name).as_posix()
        return StoredFile(
            original_filename=original_filename,
            storage_path=relative_path,
            absolute_path=target_path,
            content_type=upload_file.content_type,
            file_size=total_size,
            file_hash=sha256.hexdigest(),
        )

    def delete_file(self, storage_path: str) -> bool:
        path = self.get_file_path(storage_path)
        if path.exists():
            path.unlink()
            return True
        return False

    def calculate_sha256(self, storage_path: str) -> str:
        path = self.get_file_path(storage_path)
        return calculate_sha256(path)

    def clone_file(
        self,
        storage_path: str,
        *,
        original_filename: str,
        content_type: str | None = None,
    ) -> StoredFile:
        source = self.get_file_path(storage_path)
        if not source.exists():
            raise FileNotFoundError(original_filename)
        suffix = Path(original_filename).suffix.lower()
        now = datetime.utcnow()
        relative_dir = Path(f"{now:%Y}") / f"{now:%m}"
        target_dir = self.ensure_safe_path(self.root / relative_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = self.ensure_safe_path(target_dir / f"{uuid4().hex}{suffix}")
        shutil.copy2(source, target_path)
        relative_path = target_path.relative_to(self.root).as_posix()
        return StoredFile(
            original_filename=Path(original_filename).name,
            storage_path=relative_path,
            absolute_path=target_path,
            content_type=content_type,
            file_size=target_path.stat().st_size,
            file_hash=calculate_sha256(target_path),
        )


def calculate_sha256(file_path: str | Path) -> str:
    sha256 = hashlib.sha256()
    path = Path(file_path)
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


storage_provider = LocalStorageProvider()


async def save_upload_file(upload_file: UploadFile, *, max_size_bytes: int | None = None) -> StoredFile:
    return await storage_provider.save_upload_file(upload_file, max_size_bytes=max_size_bytes)


def get_file_path(storage_path: str) -> Path:
    return storage_provider.get_file_path(storage_path)


def delete_file(storage_path: str) -> bool:
    return storage_provider.delete_file(storage_path)


def clone_stored_file(
    storage_path: str,
    *,
    original_filename: str,
    content_type: str | None = None,
) -> StoredFile:
    return storage_provider.clone_file(
        storage_path,
        original_filename=original_filename,
        content_type=content_type,
    )


def ensure_safe_path(path: str | Path) -> Path:
    return storage_provider.ensure_safe_path(Path(path))
