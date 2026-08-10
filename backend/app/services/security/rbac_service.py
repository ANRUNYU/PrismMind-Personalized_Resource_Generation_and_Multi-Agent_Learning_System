from __future__ import annotations

from collections.abc import Iterable

from app.models.enums import UserRole
from app.models.user import User


class RBACService:
    def check_role(self, user: User, allowed_roles: Iterable[UserRole | str]) -> bool:
        normalized = {UserRole(role) if isinstance(role, str) else role for role in allowed_roles}
        return UserRole(user.role) in normalized

    def can_access_teacher_module(self, user: User) -> bool:
        return self.check_role(user, {UserRole.teacher, UserRole.admin})

    def can_access_student_module(self, user: User) -> bool:
        return self.check_role(user, {UserRole.student, UserRole.admin})

    def can_access_admin_module(self, user: User) -> bool:
        return self.check_role(user, {UserRole.admin})


rbac_service = RBACService()
