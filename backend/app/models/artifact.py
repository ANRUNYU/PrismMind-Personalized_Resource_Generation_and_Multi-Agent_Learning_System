from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import JSONDict, IdMixin, TimestampMixin, dict_default
from app.models.enums import ArtifactStatus, ArtifactType

if TYPE_CHECKING:
    from app.models.file_asset import FileAsset
    from app.models.task import GenerationTask
    from app.models.user import User


class GeneratedArtifact(IdMixin, TimestampMixin, Base):
    __tablename__ = "generated_artifacts"
    __table_args__ = (
        Index("ix_generated_artifacts_owner_type_created_at", "owner_id", "artifact_type", "created_at"),
        Index("ix_generated_artifacts_owner_status", "owner_id", "status"),
    )

    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    artifact_type: Mapped[ArtifactType] = mapped_column(
        Enum(ArtifactType, name="artifact_type"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_format: Mapped[str] = mapped_column(String(40), nullable=False, default="markdown", server_default="markdown")
    request_payload: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict_default)
    status: Mapped[ArtifactStatus] = mapped_column(
        Enum(ArtifactStatus, name="artifact_status"),
        nullable=False,
        default=ArtifactStatus.completed,
        server_default=ArtifactStatus.completed.value,
        index=True,
    )
    model_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    token_usage: Mapped[dict[str, Any] | None] = mapped_column(JSONDict, nullable=True)
    quality_analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONDict, nullable=True)
    file_asset_id: Mapped[int | None] = mapped_column(ForeignKey("file_assets.id", ondelete="SET NULL"), nullable=True, index=True)

    owner: Mapped[User] = relationship(back_populates="artifacts")
    file_asset: Mapped[FileAsset | None] = relationship(back_populates="artifacts")
    generation_tasks: Mapped[list[GenerationTask]] = relationship(back_populates="result_artifact")
