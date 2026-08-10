from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_student
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.student_exercise import (
    StudentExerciseCreate,
    StudentExerciseListResponse,
    StudentExerciseRead,
    StudentExerciseStartResponse,
    StudentExerciseSubmitRequest,
    StudentExerciseSubmitResponse,
    StudentExerciseUpdate,
)
from app.services.student_exercise_service import student_exercise_service
from app.utils.response import success_response

router = APIRouter()


@router.get("", response_model=ApiResponse[StudentExerciseListResponse], summary="List current student's exercises")
def list_student_exercises(
    request: Request,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.list_exercises(db, current_user, page=page, page_size=page_size)
    return success_response(data=data, request=request)


@router.post(
    "",
    response_model=ApiResponse[StudentExerciseRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create a personal exercise",
)
def create_student_exercise(
    payload: StudentExerciseCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.create_personal_exercise(db, payload, current_user)
    return success_response(data=data, request=request)


@router.get("/{exercise_id}", response_model=ApiResponse[StudentExerciseRead], summary="Get exercise detail")
def get_student_exercise(
    exercise_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.get_exercise(db, exercise_id, current_user)
    return success_response(data=data, request=request)


@router.patch("/{exercise_id}", response_model=ApiResponse[StudentExerciseRead], summary="Update a personal exercise")
def update_student_exercise(
    exercise_id: str,
    payload: StudentExerciseUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.update_personal_exercise(db, exercise_id, payload, current_user)
    return success_response(data=data, request=request)


@router.delete("/{exercise_id}", response_model=ApiResponse[dict], summary="Delete a personal exercise")
def delete_student_exercise(
    exercise_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.delete_personal_exercise(db, exercise_id, current_user)
    return success_response(data=data, request=request)


@router.post("/{exercise_id}/start", response_model=ApiResponse[StudentExerciseStartResponse], summary="Start an exercise")
def start_student_exercise(
    exercise_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.start_exercise(db, exercise_id, current_user)
    return success_response(data=data, request=request)


@router.post(
    "/{exercise_id}/submit",
    response_model=ApiResponse[StudentExerciseSubmitResponse],
    summary="Submit exercise answers",
)
def submit_student_exercise(
    exercise_id: str,
    payload: StudentExerciseSubmitRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.submit_exercise(db, exercise_id, payload, current_user)
    return success_response(data=data, request=request)


@router.post(
    "/{exercise_id}/favorite",
    response_model=ApiResponse[StudentExerciseRead],
    summary="Toggle personal exercise favorite status",
)
def favorite_student_exercise(
    exercise_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.favorite_personal_exercise(db, exercise_id, current_user)
    return success_response(data=data, request=request)


@router.post(
    "/{exercise_id}/complete",
    response_model=ApiResponse[StudentExerciseRead],
    summary="Mark a personal exercise as completed",
)
def complete_student_exercise(
    exercise_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student),
):
    data = student_exercise_service.complete_personal_exercise(db, exercise_id, current_user)
    return success_response(data=data, request=request)
