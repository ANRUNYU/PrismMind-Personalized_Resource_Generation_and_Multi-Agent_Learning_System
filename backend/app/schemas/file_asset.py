from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import FileParseStatus


class FileAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    original_filename: str
    content_type: str | None = None
    file_size: int
    file_hash: str
    asset_type: str
    parse_status: FileParseStatus
    parse_error: str | None = None
    parsed_at: datetime | None = None
    parsed_text_char_count: int = 0
    upload_status: str = "succeeded"
    knowledge_ingest_status: str | None = None
    knowledge_document_id: int | None = None
    created_at: datetime
    updated_at: datetime


class FileUploadResponse(FileAssetRead):
    pass


class FileAssetListItem(FileAssetRead):
    pass


class FileAssetListResponse(BaseModel):
    items: list[FileAssetListItem]
    total: int
    page: int
    page_size: int


class FileDeleteResponse(BaseModel):
    id: int = Field(description="Deleted file asset id")
    deleted: bool = Field(default=True, description="Whether metadata and local file were deleted")


class FileBatchUploadItem(BaseModel):
    original_name: str
    success: bool
    file_id: int | None = None
    parse_status: FileParseStatus | None = None
    knowledge_document_id: int | None = None
    error_code: str | None = None
    error_message: str | None = None


class FileBatchUploadResponse(BaseModel):
    items: list[FileBatchUploadItem]
    succeeded: int
    failed: int
