from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.artifact import GeneratedArtifact
from app.models.enums import ArtifactStatus, ArtifactType, UserRole
from app.models.user import User


class ArtifactRepository:
    def create_artifact(
        self,
        db: Session,
        *,
        owner_id: int,
        artifact_type: ArtifactType,
        title: str,
        content: str,
        content_format: str = "markdown",
        request_payload: dict[str, Any] | None = None,
        status: ArtifactStatus = ArtifactStatus.completed,
        model_name: str | None = None,
        token_usage: dict[str, Any] | None = None,
        quality_analysis: dict[str, Any] | None = None,
    ) -> GeneratedArtifact:
        artifact = GeneratedArtifact(
            owner_id=owner_id,
            artifact_type=artifact_type,
            title=title,
            content=content,
            content_format=content_format,
            request_payload=request_payload or {},
            status=status,
            model_name=model_name,
            token_usage=token_usage,
            quality_analysis=quality_analysis,
        )
        db.add(artifact)
        db.commit()
        db.refresh(artifact)
        return artifact

    def save_quality_analysis(self, db: Session, artifact: GeneratedArtifact, analysis: Any) -> GeneratedArtifact:
        artifact.quality_analysis = analysis.model_dump(mode="json") if hasattr(analysis, "model_dump") else analysis
        db.add(artifact)
        db.commit()
        db.refresh(artifact)
        return artifact

    def get_by_id(self, db: Session, artifact_id: int) -> GeneratedArtifact | None:
        return db.get(GeneratedArtifact, artifact_id)

    def list_by_owner(
        self,
        db: Session,
        *,
        owner_id: int,
        artifact_type: ArtifactType | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[GeneratedArtifact], int]:
        stmt = select(GeneratedArtifact).where(GeneratedArtifact.owner_id == owner_id)
        count_stmt = select(func.count()).select_from(GeneratedArtifact).where(GeneratedArtifact.owner_id == owner_id)
        if artifact_type is not None:
            stmt = stmt.where(GeneratedArtifact.artifact_type == artifact_type)
            count_stmt = count_stmt.where(GeneratedArtifact.artifact_type == artifact_type)

        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(GeneratedArtifact.created_at.desc(), GeneratedArtifact.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def list_all(
        self,
        db: Session,
        *,
        artifact_type: ArtifactType | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[GeneratedArtifact], int]:
        stmt = select(GeneratedArtifact)
        count_stmt = select(func.count()).select_from(GeneratedArtifact)
        if artifact_type is not None:
            stmt = stmt.where(GeneratedArtifact.artifact_type == artifact_type)
            count_stmt = count_stmt.where(GeneratedArtifact.artifact_type == artifact_type)
        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(GeneratedArtifact.created_at.desc(), GeneratedArtifact.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def get_accessible_artifact(
        self,
        db: Session,
        *,
        artifact_id: int,
        current_user: User,
    ) -> tuple[GeneratedArtifact | None, bool]:
        artifact = self.get_by_id(db, artifact_id)
        if artifact is None:
            return None, False
        if artifact.owner_id == current_user.id or current_user.role == UserRole.admin:
            return artifact, True
        return artifact, False


artifact_repository = ArtifactRepository()
