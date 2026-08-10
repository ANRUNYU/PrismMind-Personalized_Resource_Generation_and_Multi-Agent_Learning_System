from __future__ import annotations

from typing import TYPE_CHECKING

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import IdMixin, TimestampMixin
from app.models.enums import FileParseStatus

if TYPE_CHECKING:
    from app.models.artifact import GeneratedArtifact
    from app.models.knowledge import KnowledgeDocument
    from app.models.user import User


class FileAsset(IdMixin, TimestampMixin, Base):
    __tablename__ = "file_assets"
    __table_args__ = (
        Index("ix_file_assets_owner_created_at", "owner_id", "created_at"),
        Index("ix_file_assets_owner_parse_status", "owner_id", "parse_status"),
    )

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    asset_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    parse_status: Mapped[FileParseStatus] = mapped_column(
        Enum(FileParseStatus, name="file_parse_status"),
        nullable=False,
        default=FileParseStatus.pending,
        server_default=FileParseStatus.pending.value,
        index=True,
    )
    parse_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    parsed_text_char_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    owner: Mapped[User] = relationship(back_populates="files")
    artifacts: Mapped[list[GeneratedArtifact]] = relationship(back_populates="file_asset")
    knowledge_documents: Mapped[list[KnowledgeDocument]] = relationship(back_populates="file_asset")

    @property
    def upload_status(self) -> str:
        return "succeeded"

    @property
    def knowledge_ingest_status(self) -> str | None:
        if not self.knowledge_documents:
            return None
        return self.knowledge_documents[-1].status.value

    @property
    def knowledge_document_id(self) -> int | None:
        if not self.knowledge_documents:
            return None
        return self.knowledge_documents[-1].id
