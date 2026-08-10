from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException
from app.models.course import Course
from app.models.enums import UserRole
from app.models.resource import LearningResource
from app.models.user import User


class ResourceRepository:
    def create_resource(
        self,
        db: Session,
        *,
        user_id: int,
        profile_id: int | None,
        course_id: int | None,
        resource_type: str,
        title: str,
        content: str,
        topic: str | None,
        difficulty_level: str | None,
        tags: list[Any] | None = None,
    ) -> LearningResource:
        self._validate_course_ids(db, [{"course_id": course_id}])
        resource = LearningResource(
            user_id=user_id,
            profile_id=profile_id,
            course_id=course_id,
            resource_type=resource_type,
            title=title,
            content=content,
            topic=topic,
            difficulty_level=difficulty_level,
            tags=tags or [],
            is_viewed=False,
            is_completed=False,
            user_rating=None,
        )
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return resource

    def create_resources(
        self,
        db: Session,
        *,
        resources: list[dict[str, Any]],
    ) -> list[LearningResource]:
        self._validate_course_ids(db, resources)
        models = [LearningResource(**resource) for resource in resources]
        db.add_all(models)
        db.commit()
        for model in models:
            db.refresh(model)
        return models

    def get_by_id(self, db: Session, resource_id: int) -> LearningResource | None:
        return db.get(LearningResource, resource_id)

    def get_accessible_resources_by_ids(
        self,
        db: Session,
        *,
        resource_ids: list[int],
        current_user: User,
    ) -> tuple[list[LearningResource], list[int], list[int]]:
        if not resource_ids:
            return [], [], []
        unique_ids = list(dict.fromkeys(resource_ids))
        resources = list(db.scalars(select(LearningResource).where(LearningResource.id.in_(unique_ids))))
        by_id = {resource.id: resource for resource in resources}
        missing_ids = [resource_id for resource_id in unique_ids if resource_id not in by_id]
        forbidden_ids = [
            resource.id
            for resource in resources
            if current_user.role != UserRole.admin and resource.user_id != current_user.id
        ]
        accessible = [
            resource
            for resource in resources
            if current_user.role == UserRole.admin or resource.user_id == current_user.id
        ]
        return accessible, missing_ids, forbidden_ids

    def list_completed_resources(
        self,
        db: Session,
        *,
        user_id: int,
        limit: int = 20,
    ) -> list[LearningResource]:
        stmt = (
            select(LearningResource)
            .where(LearningResource.user_id == user_id, LearningResource.is_completed.is_(True))
            .order_by(LearningResource.updated_at.desc(), LearningResource.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt))

    def list_recent_resources(
        self,
        db: Session,
        *,
        user_id: int,
        limit: int = 10,
    ) -> list[LearningResource]:
        stmt = (
            select(LearningResource)
            .where(LearningResource.user_id == user_id)
            .order_by(LearningResource.created_at.desc(), LearningResource.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt))

    def list_by_user(
        self,
        db: Session,
        *,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        resource_type: str | None = None,
        topic: str | None = None,
        is_completed: bool | None = None,
        difficulty_level: str | None = None,
    ) -> tuple[list[LearningResource], int]:
        stmt = select(LearningResource).where(LearningResource.user_id == user_id)
        count_stmt = select(func.count()).select_from(LearningResource).where(LearningResource.user_id == user_id)
        stmt, count_stmt = self._apply_filters(
            stmt,
            count_stmt,
            resource_type=resource_type,
            topic=topic,
            is_completed=is_completed,
            difficulty_level=difficulty_level,
        )
        return self._paginate(db, stmt, count_stmt, page, page_size)

    def list_all(
        self,
        db: Session,
        *,
        page: int = 1,
        page_size: int = 20,
        resource_type: str | None = None,
        topic: str | None = None,
        is_completed: bool | None = None,
        difficulty_level: str | None = None,
        user_id: int | None = None,
    ) -> tuple[list[LearningResource], int]:
        stmt = select(LearningResource)
        count_stmt = select(func.count()).select_from(LearningResource)
        if user_id is not None:
            stmt = stmt.where(LearningResource.user_id == user_id)
            count_stmt = count_stmt.where(LearningResource.user_id == user_id)
        stmt, count_stmt = self._apply_filters(
            stmt,
            count_stmt,
            resource_type=resource_type,
            topic=topic,
            is_completed=is_completed,
            difficulty_level=difficulty_level,
        )
        return self._paginate(db, stmt, count_stmt, page, page_size)

    def mark_viewed(self, db: Session, resource: LearningResource) -> LearningResource:
        resource.is_viewed = True
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return resource

    def mark_completed(self, db: Session, resource: LearningResource) -> LearningResource:
        resource.is_completed = True
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return resource

    def rate_resource(self, db: Session, *, resource: LearningResource, user_rating: int) -> LearningResource:
        resource.user_rating = float(user_rating)
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return resource

    def delete_resource(self, db: Session, resource: LearningResource) -> None:
        db.delete(resource)
        db.commit()

    def _apply_filters(
        self,
        stmt,
        count_stmt,
        *,
        resource_type: str | None,
        topic: str | None,
        is_completed: bool | None,
        difficulty_level: str | None,
    ):
        if resource_type:
            stmt = stmt.where(LearningResource.resource_type == resource_type)
            count_stmt = count_stmt.where(LearningResource.resource_type == resource_type)
        if topic:
            pattern = f"%{topic}%"
            stmt = stmt.where(LearningResource.topic.ilike(pattern))
            count_stmt = count_stmt.where(LearningResource.topic.ilike(pattern))
        if is_completed is not None:
            stmt = stmt.where(LearningResource.is_completed == is_completed)
            count_stmt = count_stmt.where(LearningResource.is_completed == is_completed)
        if difficulty_level:
            stmt = stmt.where(LearningResource.difficulty_level == difficulty_level)
            count_stmt = count_stmt.where(LearningResource.difficulty_level == difficulty_level)
        return stmt, count_stmt

    def _paginate(self, db: Session, stmt, count_stmt, page: int, page_size: int) -> tuple[list[LearningResource], int]:
        total = db.scalar(count_stmt) or 0
        items = list(
            db.scalars(
                stmt.order_by(LearningResource.created_at.desc(), LearningResource.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def _validate_course_ids(self, db: Session, resources: list[dict[str, Any]]) -> None:
        course_ids = {
            int(resource["course_id"])
            for resource in resources
            if resource.get("course_id") is not None
        }
        if not course_ids:
            return
        existing_ids = set(db.scalars(select(Course.id).where(Course.id.in_(course_ids))))
        missing_ids = sorted(course_ids - existing_ids)
        if missing_ids:
            raise BadRequestException(f"课程不存在: {missing_ids[0]}")


resource_repository = ResourceRepository()
