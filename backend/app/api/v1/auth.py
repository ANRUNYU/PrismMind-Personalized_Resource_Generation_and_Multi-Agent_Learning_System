from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, get_db
from app.core.exceptions import BadRequestException, ConflictException, ForbiddenException, UnauthorizedException
from app.core.security import create_access_token, create_refresh_token, decode_token, get_password_hash, verify_password
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.user_repository import user_repository
from app.schemas.auth import (
    CurrentUserResponse,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RegisterRequest,
    TokenRefreshRequest,
    TokenResponse,
)
from app.schemas.common import ApiResponse
from app.schemas.user import UserCreate, UserRead
from app.utils.response import success_response

router = APIRouter()


def _to_user_read(user: User) -> UserRead:
    return UserRead.model_validate(user)


@router.post("/register", response_model=ApiResponse[UserRead], summary="注册用户")
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    if user_repository.get_by_username(db, payload.username):
        raise ConflictException("用户名已存在")
    if user_repository.get_by_email(db, str(payload.email)):
        raise ConflictException("邮箱已存在")

    user_create = UserCreate.model_validate(payload.model_dump())
    try:
        password_hash = get_password_hash(payload.password)
    except ValueError as exc:
        raise BadRequestException("密码不符合规则") from exc

    try:
        user = user_repository.create_user(db, user_create, password_hash)
    except SQLAlchemyError as exc:
        db.rollback()
        raise BadRequestException("用户注册失败", detail="数据库写入异常") from exc

    return success_response(data=_to_user_read(user), request=request)


@router.post("/login", response_model=ApiResponse[LoginResponse], summary="用户登录")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = user_repository.get_by_username_or_email(db, payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise UnauthorizedException("用户名或密码错误")
    if not user.is_active:
        raise ForbiddenException("用户已被禁用")
    if payload.role is not None and user.role != UserRole.admin and user.role != payload.role:
        raise ForbiddenException("所选登录身份与账号角色不匹配")

    try:
        user = user_repository.update_last_login(db, user.id) or user
    except SQLAlchemyError as exc:
        db.rollback()
        raise BadRequestException("登录状态更新失败", detail="数据库写入异常") from exc

    settings = get_settings()
    response = LoginResponse(
        access_token=create_access_token(subject=user.id, role=user.role),
        refresh_token=create_refresh_token(subject=user.id, role=user.role),
        expires_in=settings.access_token_expire_minutes * 60,
        user=_to_user_read(user),
    )
    return success_response(data=response, request=request)


@router.post("/refresh", response_model=ApiResponse[TokenResponse], summary="刷新访问令牌")
def refresh_token(payload: TokenRefreshRequest, request: Request, db: Session = Depends(get_db)):
    try:
        token_payload = decode_token(payload.refresh_token)
    except Exception as exc:
        raise UnauthorizedException("无效或已过期的刷新令牌") from exc

    if token_payload.get("token_type") != "refresh":
        raise UnauthorizedException("令牌类型错误")

    subject = token_payload.get("sub")
    if subject is None:
        raise UnauthorizedException("令牌缺少用户标识")

    try:
        user_id = int(subject)
    except (TypeError, ValueError) as exc:
        raise UnauthorizedException("令牌用户标识无效") from exc

    user = user_repository.get_by_id(db, user_id)
    if user is None:
        raise UnauthorizedException("用户不存在")
    if not user.is_active:
        raise ForbiddenException("用户已被禁用")

    settings = get_settings()
    response = TokenResponse(
        access_token=create_access_token(subject=user.id, role=user.role),
        expires_in=settings.access_token_expire_minutes * 60,
    )
    return success_response(data=response, request=request)


@router.post("/logout", response_model=ApiResponse[LogoutResponse], summary="用户登出")
def logout(request: Request, current_user: User = Depends(get_current_user)):
    _ = current_user
    return success_response(data=LogoutResponse(logged_out=True), request=request)


@router.get("/me", response_model=ApiResponse[CurrentUserResponse], summary="获取当前用户")
def me(request: Request, current_user: User = Depends(get_current_user)):
    return success_response(data=CurrentUserResponse.model_validate(current_user), request=request)
