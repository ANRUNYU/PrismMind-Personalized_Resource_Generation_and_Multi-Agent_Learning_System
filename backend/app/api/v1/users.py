from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_admin
from app.core.exceptions import BadRequestException, ForbiddenException, NotFoundException
from app.core.security import get_password_hash, verify_password
from app.models.user import User
from app.repositories.user_repository import user_repository
from app.schemas.common import ApiResponse
from app.schemas.user import (
    MyPasswordChange,
    MyProfileUpdate,
    PasswordChangeResponse,
    UserListResponse,
    UserRead,
    UserStatusUpdate,
)
from app.utils.response import success_response

router = APIRouter()


@router.get("/me", response_model=ApiResponse[UserRead], summary="获取当前用户")
def get_my_profile(request: Request, current_user: User = Depends(get_current_user)):
    return success_response(data=UserRead.model_validate(current_user), request=request)


@router.patch("/me/profile", response_model=ApiResponse[UserRead], summary="修改本人姓名")
def update_my_profile(
    payload: MyProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    full_name = payload.full_name.strip()
    if not full_name:
        raise BadRequestException("姓名不能为空")
    try:
        user = user_repository.update_my_profile(
            db,
            current_user.id,
            full_name=full_name,
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise BadRequestException("个人信息更新失败", detail="数据库写入异常") from exc
    if user is None:
        raise NotFoundException("用户不存在")
    return success_response(data=UserRead.model_validate(user), request=request)


@router.post(
    "/me/password",
    response_model=ApiResponse[PasswordChangeResponse],
    summary="修改本人密码",
)
def change_my_password(
    payload: MyPasswordChange,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.new_password != payload.confirm_password:
        raise BadRequestException("两次输入的新密码不一致")
    if payload.current_password == payload.new_password:
        raise BadRequestException("新密码不能与当前密码相同")
    if not verify_password(payload.current_password, current_user.password_hash):
        raise BadRequestException("当前密码不正确")
    try:
        password_hash = get_password_hash(payload.new_password)
        user = user_repository.update_password_hash(
            db,
            current_user.id,
            password_hash=password_hash,
        )
    except ValueError as exc:
        raise BadRequestException("新密码不符合规则") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise BadRequestException("密码修改失败", detail="数据库写入异常") from exc
    if user is None:
        raise NotFoundException("用户不存在")
    return success_response(data=PasswordChangeResponse(updated=True), request=request)


@router.get("", response_model=ApiResponse[UserListResponse], summary="管理员查看用户列表")
def list_users(
    request: Request,
    page: int = Query(default=1, ge=1, description="页码"),
    page_size: int = Query(default=20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    _ = current_user
    users, total = user_repository.list_users(db, page, page_size)
    data = UserListResponse(
        items=[UserRead.model_validate(user) for user in users],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.patch("/{user_id}/status", response_model=ApiResponse[UserRead], summary="管理员启用或禁用用户")
def update_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if current_user.id == user_id and not payload.is_active:
        raise ForbiddenException("不能禁用当前登录用户")

    try:
        user = user_repository.set_user_active(db, user_id, payload.is_active)
    except SQLAlchemyError as exc:
        db.rollback()
        raise BadRequestException("用户状态更新失败", detail="数据库写入异常") from exc

    if user is None:
        raise NotFoundException("用户不存在")

    return success_response(data=UserRead.model_validate(user), request=request)
