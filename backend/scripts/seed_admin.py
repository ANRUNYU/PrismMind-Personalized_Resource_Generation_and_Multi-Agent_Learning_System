from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy.exc import SQLAlchemyError

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.enums import UserRole
from app.repositories.user_repository import user_repository
from app.schemas.user import UserCreate


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def main() -> int:
    if SessionLocal is None:
        print("DATABASE_URL is not configured. Please set backend/.env before seeding admin.")
        return 2

    username = _required_env("ADMIN_USERNAME")
    email = _required_env("ADMIN_EMAIL")
    password = _required_env("ADMIN_PASSWORD")
    full_name = os.getenv("ADMIN_FULL_NAME", "").strip() or None

    db = SessionLocal()
    try:
        existing_user = user_repository.get_by_username(db, username)
        if existing_user:
            print(f"Admin seed skipped: username '{username}' already exists.")
            return 0

        existing_email = user_repository.get_by_email(db, email)
        if existing_email:
            print(f"Admin seed skipped: email '{email}' already exists.")
            return 0

        user_create = UserCreate(
            username=username,
            email=email,
            password=password,
            full_name=full_name,
            role=UserRole.admin,
        )
        user = user_repository.create_user(
            db,
            user_create,
            get_password_hash(password),
        )
        print(f"Admin user created: id={user.id}, username='{user.username}', role='{user.role.value}'.")
        return 0
    except SQLAlchemyError as exc:
        db.rollback()
        print(f"Admin seed failed because of a database error: {exc.__class__.__name__}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
