from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole

Username = Annotated[str, Field(min_length=3, max_length=50, description="用户名，3-50 个字符")]
Password = Annotated[str, Field(min_length=8, max_length=72, description="密码，至少 8 位，最长 72 字符")]


class UserCreate(BaseModel):
    username: Username
    email: EmailStr = Field(description="邮箱")
    password: Password
    full_name: str | None = Field(default=None, max_length=120, description="姓名")
    role: UserRole = Field(description="用户角色：teacher/student/admin")


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    full_name: str | None = None
    role: UserRole
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
    last_login_at: datetime | None = None


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, max_length=120)
    role: UserRole | None = None
    is_active: bool | None = None


class UserStatusUpdate(BaseModel):
    is_active: bool = Field(description="是否启用用户")


class MyProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=120, description="姓名或显示名称")


class MyPasswordChange(BaseModel):
    current_password: Password
    new_password: Password
    confirm_password: Password


class PasswordChangeResponse(BaseModel):
    updated: bool


class UserListResponse(BaseModel):
    items: list[UserRead]
    total: int
    page: int
    page_size: int
