from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import FileParseStatus, UserRole
from app.models.file_asset import FileAsset
from app.models.knowledge import KnowledgeDocument
from app.models.user import User


class FileRepository:
    def create_file_asset(
        self,
        db: Session,
        *,
        owner_id: int,
        original_filename: str,
        storage_path: str,
        content_type: str | None,
        file_size: int,
        file_hash: str,
        asset_type: str,
        parse_status: FileParseStatus = FileParseStatus.pending,
    ) -> FileAsset:
        file_asset = FileAsset(
            owner_id=owner_id,
            original_filename=original_filename,
            storage_path=storage_path,
            content_type=content_type,
            file_size=file_size,
            file_hash=file_hash,
            asset_type=asset_type,
            parse_status=parse_status,
        )
        db.add(file_asset)
        db.commit()
        db.refresh(file_asset)
        return file_asset

    def get_by_id(self, db: Session, file_id: int) -> FileAsset | None:
        return db.get(FileAsset, file_id)

    def list_by_owner(
        self,
        db: Session,
        *,
        owner_id: int,
        asset_type: str | None = None,
        page: int = 1,
        page_size: int = 100,
    ) -> tuple[list[FileAsset], int]:
        stmt = select(FileAsset).where(FileAsset.owner_id == owner_id)
        count_stmt = select(func.count()).select_from(FileAsset).where(FileAsset.owner_id == owner_id)
        if asset_type is not None:
            stmt = stmt.where(FileAsset.asset_type == asset_type)
            count_stmt = count_stmt.where(FileAsset.asset_type == asset_type)

        total = int(db.scalar(count_stmt) or 0)
        items = list(
            db.scalars(
                stmt.order_by(FileAsset.created_at.desc(), FileAsset.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def has_knowledge_documents(self, db: Session, file_id: int) -> bool:
        stmt = select(KnowledgeDocument.id).where(KnowledgeDocument.file_asset_id == file_id).limit(1)
        return db.scalar(stmt) is not None

    def update_parse_status(
        self,
        db: Session,
        *,
        file_id: int,
        parse_status: FileParseStatus,
        parse_error: str | None = None,
        parsed_text_char_count: int | None = None,
    ) -> FileAsset | None:
        file_asset = self.get_by_id(db, file_id)
        if file_asset is None:
            return None
        file_asset.parse_status = parse_status
        file_asset.parse_error = parse_error
        if parsed_text_char_count is not None:
            file_asset.parsed_text_char_count = parsed_text_char_count
        file_asset.parsed_at = datetime.now(timezone.utc) if parse_status == FileParseStatus.parsed else None
        db.add(file_asset)
        db.commit()
        db.refresh(file_asset)
        return file_asset

    def delete(self, db: Session, file_asset: FileAsset) -> None:
        db.delete(file_asset)
        db.commit()

    def check_owner_or_admin(self, file_asset: FileAsset, current_user: User) -> bool:
        return file_asset.owner_id == current_user.id or current_user.role == UserRole.admin

    def get_accessible_file(
        self,
        db: Session,
        *,
        file_id: int,
        current_user: User,
    ) -> tuple[FileAsset | None, bool]:
        file_asset = self.get_by_id(db, file_id)
        if file_asset is None:
            return None, False
        return file_asset, self.check_owner_or_admin(file_asset, current_user)


file_repository = FileRepository()
