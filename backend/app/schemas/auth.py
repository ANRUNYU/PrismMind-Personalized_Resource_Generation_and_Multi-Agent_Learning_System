from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole
from app.schemas.user import Password, UserRead, Username


class RegisterRequest(BaseModel):
    username: Username
    email: EmailStr = Field(description="邮箱")
    password: Password
    full_name: str | None = Field(default=None, max_length=120, description="姓名")
    role: UserRole = Field(description="用户角色：teacher/student/admin")


class LoginRequest(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=255, description="用户名或邮箱")]
    password: Password
    role: UserRole | None = Field(default=None, description="期望登录身份：teacher/student")


class TokenRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, description="刷新令牌")


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class LoginResponse(TokenResponse):
    refresh_token: str
    user: UserRead


class LogoutResponse(BaseModel):
    logged_out: bool


class CurrentUserResponse(UserRead):
    pass
