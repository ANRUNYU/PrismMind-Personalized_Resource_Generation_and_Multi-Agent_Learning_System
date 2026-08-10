from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_teacher
from app.core.exceptions import AppException, ForbiddenException, NotFoundException
from app.models.enums import ArtifactType, UserRole
from app.models.user import User
from app.repositories.artifact_repository import artifact_repository
from app.repositories.task_repository import task_repository
from app.schemas.common import ApiResponse
from app.schemas.task import TaskCreateResponse
from app.schemas.teacher_generation import (
    CourseDesignGenerateRequest,
    ExerciseGenerateRequest,
    GenerationReference,
    GeneratedArtifactDetailResponse,
    GeneratedArtifactListItem,
    GeneratedArtifactListResponse,
    PaperGenerateRequest,
    ProjectPracticeGenerateRequest,
    TeacherGenerationResponse,
    TeachingDesignGenerateRequest,
    TrainingPlanExtractSkillsRequest,
    TrainingPlanExtractSkillsResponse,
    TrainingPlanGenerateRequest,
)
from app.services.generation.teacher_generation_service import GenerationResult, teacher_generation_service
from app.tasks.generation_tasks import run_teacher_generation_task
from app.utils.response import success_response

router = APIRouter()


def _generation_response(result: GenerationResult) -> TeacherGenerationResponse:
    response = TeacherGenerationResponse.model_validate(result.artifact)
    return response.model_copy(
        update={
            "warnings": result.warnings or None,
            "references": [
                GenerationReference(
                    source_type=reference.source_type,
                    file_id=reference.file_id,
                    document_id=reference.document_id,
                    chunk_index=reference.chunk_index,
                    source_filename=reference.source_filename,
                    excerpt=reference.excerpt,
                )
                for reference in result.references
            ]
            or None,
            "quality_analysis": result.quality_analysis,
        }
    )


def _create_async_generation_task(
    *,
    db: Session,
    current_user: User,
    task_type: str,
    payload,
    request: Request,
):
    teacher_generation_service.validate_course_selection(db, current_user, payload)
    task = task_repository.create_task(
        db,
        owner_id=current_user.id,
        task_type=task_type,
        input_payload={
            "source": "teacher_generation_async",
            "payload": payload.model_dump(mode="json"),
        },
    )
    try:
        run_teacher_generation_task.apply_async(args=[task.id])
    except Exception as exc:
        task_repository.mark_task_failed(db, task=task, error_message=f"{exc.__class__.__name__}: {exc}")
        raise AppException(
            "异步生成任务提交失败，请检查 Redis 和 Celery 配置。",
            code=50300,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.__class__.__name__,
        ) from exc
    return success_response(
        data=TaskCreateResponse(
            task_id=task.id,
            task_type=task.task_type,
            status=task.status,
            polling_url=f"/api/v1/tasks/{task.id}",
            stream_url=f"/api/v1/tasks/{task.id}/stream",
        ),
        request=request,
    )


@router.post(
    "/training-plans/extract-skills",
    response_model=ApiResponse[TrainingPlanExtractSkillsResponse],
    summary="Extract core skills for training plan generation",
)
def extract_training_plan_skills(
    payload: TrainingPlanExtractSkillsRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    data = teacher_generation_service.extract_training_plan_skills(db, current_user, payload)
    return success_response(data=data, request=request)


@router.post(
    "/training-plans/generate",
    response_model=ApiResponse[TeacherGenerationResponse],
    summary="智能培养方案生成",
)
def generate_training_plan(
    payload: TrainingPlanGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    result = teacher_generation_service.generate_training_plan(db, current_user, payload)
    return success_response(data=_generation_response(result), request=request)


@router.post(
    "/training-plans/generate-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Submit async training plan generation task",
)
def generate_training_plan_async(
    payload: TrainingPlanGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    return _create_async_generation_task(
        db=db,
        current_user=current_user,
        task_type="teacher_training_plan",
        payload=payload,
        request=request,
    )


@router.post(
    "/course-designs/generate",
    response_model=ApiResponse[TeacherGenerationResponse],
    summary="课程设计生成",
)
def generate_course_design(
    payload: CourseDesignGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    result = teacher_generation_service.generate_course_design(db, current_user, payload)
    return success_response(data=_generation_response(result), request=request)


@router.post(
    "/course-designs/generate-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Submit async course design generation task",
)
def generate_course_design_async(
    payload: CourseDesignGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    return _create_async_generation_task(
        db=db,
        current_user=current_user,
        task_type="teacher_course_design",
        payload=payload,
        request=request,
    )


@router.post(
    "/teaching-designs/generate",
    response_model=ApiResponse[TeacherGenerationResponse],
    summary="教学设计生成",
)
def generate_teaching_design(
    payload: TeachingDesignGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    result = teacher_generation_service.generate_teaching_design(db, current_user, payload)
    return success_response(data=_generation_response(result), request=request)


@router.post(
    "/teaching-designs/generate-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Submit async teaching design generation task",
)
def generate_teaching_design_async(
    payload: TeachingDesignGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    return _create_async_generation_task(
        db=db,
        current_user=current_user,
        task_type="teacher_teaching_design",
        payload=payload,
        request=request,
    )


@router.post(
    "/exercises/generate",
    response_model=ApiResponse[TeacherGenerationResponse],
    summary="习题批量生成",
)
def generate_exercises(
    payload: ExerciseGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    result = teacher_generation_service.generate_exercises(db, current_user, payload)
    return success_response(data=_generation_response(result), request=request)


@router.post(
    "/exercises/generate-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Submit async exercise generation task",
)
def generate_exercises_async(
    payload: ExerciseGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    return _create_async_generation_task(
        db=db,
        current_user=current_user,
        task_type="teacher_exercise",
        payload=payload,
        request=request,
    )


@router.post(
    "/papers/generate",
    response_model=ApiResponse[TeacherGenerationResponse],
    summary="试卷智能生成",
)
def generate_paper(
    payload: PaperGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    result = teacher_generation_service.generate_paper(db, current_user, payload)
    return success_response(data=_generation_response(result), request=request)


@router.post(
    "/papers/generate-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Submit async paper generation task",
)
def generate_paper_async(
    payload: PaperGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    return _create_async_generation_task(
        db=db,
        current_user=current_user,
        task_type="teacher_paper",
        payload=payload,
        request=request,
    )


@router.post(
    "/projects/generate",
    response_model=ApiResponse[TeacherGenerationResponse],
    summary="项目实践设计",
)
def generate_project_practice(
    payload: ProjectPracticeGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    result = teacher_generation_service.generate_project_practice(db, current_user, payload)
    return success_response(data=_generation_response(result), request=request)


@router.post(
    "/projects/generate-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Submit async project practice generation task",
)
def generate_project_practice_async(
    payload: ProjectPracticeGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    return _create_async_generation_task(
        db=db,
        current_user=current_user,
        task_type="teacher_project",
        payload=payload,
        request=request,
    )


@router.get(
    "/generated-artifacts",
    response_model=ApiResponse[GeneratedArtifactListResponse],
    summary="获取当前教师生成历史",
)
def list_generated_artifacts(
    request: Request,
    artifact_type: ArtifactType | None = Query(default=None, description="生成类型"),
    page: int = Query(default=1, ge=1, description="页码"),
    page_size: int = Query(default=20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    items, total = artifact_repository.list_by_owner(
        db,
        owner_id=current_user.id,
        artifact_type=artifact_type,
        page=page,
        page_size=page_size,
    )
    data = GeneratedArtifactListResponse(
        items=[GeneratedArtifactListItem.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.get(
    "/generated-artifacts/{artifact_id}",
    response_model=ApiResponse[GeneratedArtifactDetailResponse],
    summary="获取生成结果详情",
)
def get_generated_artifact(
    artifact_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    artifact, accessible = artifact_repository.get_accessible_artifact(
        db,
        artifact_id=artifact_id,
        current_user=current_user,
    )
    if artifact is None:
        raise NotFoundException("生成结果不存在")
    if not accessible:
        raise ForbiddenException("无权访问该生成结果")
    if current_user.role != UserRole.admin and artifact.owner_id != current_user.id:
        raise ForbiddenException("无权访问该生成结果")
    data = GeneratedArtifactDetailResponse.model_validate(artifact)
    return success_response(data=data, request=request)
