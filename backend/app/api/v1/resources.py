from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_student
from app.core.exceptions import AppException, BadRequestException, ForbiddenException, NotFoundException
from app.models.enums import UserRole
from app.models.resource import LearningResource
from app.models.user import User
from app.repositories.profile_repository import profile_repository
from app.repositories.resource_repository import resource_repository
from app.repositories.task_repository import task_repository
from app.schemas.common import ApiResponse
from app.schemas.resource import (
    ResourceActionResponse,
    ResourceDeleteResponse,
    ResourceGenerateRequest,
    ResourceGenerateResponse,
    ResourceGenerateSingleRequest,
    ResourceListResponse,
    ResourceRatingRequest,
    ResourceRead,
)
from app.schemas.task import TaskCreateResponse
from app.services.generation.student_generation_service import student_generation_service
from app.tasks.resource_tasks import run_student_resource_generation_task
from app.utils.response import success_response

router = APIRouter()


def _resource_read(resource: LearningResource) -> ResourceRead:
    return ResourceRead.model_validate(resource)


def _get_accessible_resource(db: Session, *, resource_id: int, current_user: User) -> LearningResource:
    resource = resource_repository.get_by_id(db, resource_id)
    if resource is None:
        raise NotFoundException("Learning resource not found")
    if current_user.role != UserRole.admin and resource.user_id != current_user.id:
        raise ForbiddenException("No permission to access this learning resource")
    return resource


def _ensure_profile_for_async(db: Session, *, current_user: User, use_profile: bool) -> None:
    if not use_profile:
        return
    if profile_repository.get_by_user_id(db, current_user.id) is None:
        raise BadRequestException("请先创建学习画像后再提交异步资源生成任务")


def _create_resource_generation_task(
    db: Session,
    *,
    current_user: User,
    task_type: str,
    payload: ResourceGenerateRequest | ResourceGenerateSingleRequest,
) -> TaskCreateResponse:
    _ensure_profile_for_async(db, current_user=current_user, use_profile=payload.use_profile)
    student_generation_service.validate_course_id(db, payload.course_id)
    task = task_repository.create_task(
        db,
        owner_id=current_user.id,
        task_type=task_type,
        input_payload={
            "source": "student_resources",
            "user_id": current_user.id,
            "payload": payload.model_dump(mode="json"),
        },
    )
    try:
        run_student_resource_generation_task.apply_async(args=[task.id])
    except Exception as exc:
        task_repository.mark_task_failed(db, task=task, error_message=str(exc)[:500])
        raise AppException(
            "学生资源异步任务提交失败，请检查 Redis/Celery 是否可用",
            code=50300,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        ) from exc

    return TaskCreateResponse(
        task_id=task.id,
        task_type=task.task_type,
        status=task.status,
        polling_url=f"/api/v1/tasks/{task.id}",
        stream_url=f"/api/v1/tasks/{task.id}/stream",
    )


@router.post(
    "/generate",
    response_model=ApiResponse[ResourceGenerateResponse],
    summary="Generate personalized learning resources",
)
def generate_resources(
    payload: ResourceGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    result = student_generation_service.generate_resources(db, current_user=current_user, payload=payload)
    data = ResourceGenerateResponse(
        resources=[_resource_read(resource) for resource in result.resources],
        warnings=result.warnings,
        references=result.references,
    )
    return success_response(data=data, request=request)


@router.post(
    "/generate-single",
    response_model=ApiResponse[ResourceGenerateResponse],
    summary="Generate one personalized learning resource",
)
def generate_single_resource(
    payload: ResourceGenerateSingleRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    result = student_generation_service.generate_single_resource(db, current_user=current_user, payload=payload)
    data = ResourceGenerateResponse(
        resources=[_resource_read(resource) for resource in result.resources],
        warnings=result.warnings,
        references=result.references,
    )
    return success_response(data=data, request=request)


@router.post(
    "/generate-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Create an async personalized learning resource generation task",
)
def generate_resources_async(
    payload: ResourceGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = _create_resource_generation_task(
        db,
        current_user=current_user,
        task_type="student_resource_generation",
        payload=payload,
    )
    return success_response(data=data, request=request)


@router.post(
    "/generate-single-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Create an async single learning resource generation task",
)
def generate_single_resource_async(
    payload: ResourceGenerateSingleRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = _create_resource_generation_task(
        db,
        current_user=current_user,
        task_type="student_resource_single_generation",
        payload=payload,
    )
    return success_response(data=data, request=request)


@router.get(
    "",
    response_model=ApiResponse[ResourceListResponse],
    summary="List learning resources",
)
def list_resources(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    resource_type: str | None = Query(default=None),
    topic: str | None = Query(default=None),
    is_completed: bool | None = Query(default=None),
    difficulty_level: str | None = Query(default=None),
    user_id: int | None = Query(default=None, description="Admin-only user filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    if current_user.role == UserRole.admin:
        items, total = resource_repository.list_all(
            db,
            page=page,
            page_size=page_size,
            resource_type=resource_type,
            topic=topic,
            is_completed=is_completed,
            difficulty_level=difficulty_level,
            user_id=user_id,
        )
    else:
        items, total = resource_repository.list_by_user(
            db,
            user_id=current_user.id,
            page=page,
            page_size=page_size,
            resource_type=resource_type,
            topic=topic,
            is_completed=is_completed,
            difficulty_level=difficulty_level,
        )
    data = ResourceListResponse(
        items=[_resource_read(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.get(
    "/{resource_id}",
    response_model=ApiResponse[ResourceRead],
    summary="Get learning resource detail",
)
def get_resource(
    resource_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    resource = _get_accessible_resource(db, resource_id=resource_id, current_user=current_user)
    return success_response(data=_resource_read(resource), request=request)


@router.delete(
    "/{resource_id}",
    response_model=ApiResponse[ResourceDeleteResponse],
    summary="Delete learning resource",
)
def delete_resource(
    resource_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    resource = _get_accessible_resource(db, resource_id=resource_id, current_user=current_user)
    resource_repository.delete_resource(db, resource)
    return success_response(
        data=ResourceDeleteResponse(resource_id=resource_id),
        request=request,
    )


@router.post(
    "/{resource_id}/view",
    response_model=ApiResponse[ResourceActionResponse],
    summary="Mark resource as viewed",
)
def mark_resource_viewed(
    resource_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    resource = _get_accessible_resource(db, resource_id=resource_id, current_user=current_user)
    updated = resource_repository.mark_viewed(db, resource)
    return success_response(
        data=ResourceActionResponse(
            resource_id=updated.id,
            is_viewed=updated.is_viewed,
            is_completed=updated.is_completed,
            user_rating=updated.user_rating,
        ),
        request=request,
    )


@router.post(
    "/{resource_id}/complete",
    response_model=ApiResponse[ResourceActionResponse],
    summary="Mark resource as completed",
)
def mark_resource_completed(
    resource_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    resource = _get_accessible_resource(db, resource_id=resource_id, current_user=current_user)
    updated = resource_repository.mark_completed(db, resource)
    return success_response(
        data=ResourceActionResponse(
            resource_id=updated.id,
            is_viewed=updated.is_viewed,
            is_completed=updated.is_completed,
            user_rating=updated.user_rating,
        ),
        request=request,
    )


@router.post(
    "/{resource_id}/rating",
    response_model=ApiResponse[ResourceActionResponse],
    summary="Rate learning resource",
)
def rate_resource(
    resource_id: int,
    payload: ResourceRatingRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    resource = _get_accessible_resource(db, resource_id=resource_id, current_user=current_user)
    updated = resource_repository.rate_resource(db, resource=resource, user_rating=payload.user_rating)
    return success_response(
        data=ResourceActionResponse(
            resource_id=updated.id,
            is_viewed=updated.is_viewed,
            is_completed=updated.is_completed,
            user_rating=updated.user_rating,
        ),
        request=request,
    )
