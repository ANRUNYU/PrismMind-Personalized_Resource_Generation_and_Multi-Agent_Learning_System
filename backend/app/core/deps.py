from collections.abc import Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.user_repository import user_repository
from app.services.security.rbac_service import rbac_service

bearer_scheme = HTTPBearer(auto_error=False)


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedException("缺少认证凭据")

    try:
        payload = decode_token(credentials.credentials)
    except Exception as exc:
        raise UnauthorizedException("无效或已过期的访问令牌") from exc

    if payload.get("token_type") != "access":
        raise UnauthorizedException("令牌类型错误")

    subject = payload.get("sub")
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
    return user


def require_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise ForbiddenException("用户已被禁用")
    return current_user


def require_roles(*roles: UserRole | str) -> Callable[[User], User]:
    allowed_roles = {UserRole(role) if isinstance(role, str) else role for role in roles}

    def dependency(current_user: User = Depends(require_active_user)) -> User:
        if not rbac_service.check_role(current_user, allowed_roles):
            raise ForbiddenException("权限不足")
        return current_user

    return dependency


require_teacher = require_roles(UserRole.teacher, UserRole.admin)
require_student = require_roles(UserRole.student, UserRole.admin)
require_admin = require_roles(UserRole.admin)
