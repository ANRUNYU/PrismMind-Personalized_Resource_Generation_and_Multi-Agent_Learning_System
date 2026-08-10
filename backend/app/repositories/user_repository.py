from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user import UserCreate


class UserRepository:
    def get_by_id(self, db: Session, user_id: int) -> User | None:
        return db.get(User, user_id)

    def get_by_username(self, db: Session, username: str) -> User | None:
        return db.scalar(select(User).where(User.username == username))

    def get_by_email(self, db: Session, email: str) -> User | None:
        return db.scalar(select(User).where(User.email == email))

    def get_by_username_or_email(self, db: Session, username_or_email: str) -> User | None:
        return db.scalar(
            select(User).where(
                or_(
                    User.username == username_or_email,
                    User.email == username_or_email,
                )
            )
        )

    def create_user(self, db: Session, user_create: UserCreate, password_hash: str) -> User:
        user = User(
            username=user_create.username,
            email=str(user_create.email),
            password_hash=password_hash,
            full_name=user_create.full_name,
            role=user_create.role,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def update_last_login(self, db: Session, user_id: int) -> User | None:
        user = self.get_by_id(db, user_id)
        if user is None:
            return None
        user.last_login_at = datetime.now(timezone.utc)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def list_users(self, db: Session, page: int, page_size: int) -> tuple[list[User], int]:
        total = db.scalar(select(func.count()).select_from(User)) or 0
        items = list(
            db.scalars(
                select(User)
                .order_by(User.created_at.desc(), User.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return items, total

    def set_user_active(self, db: Session, user_id: int, is_active: bool) -> User | None:
        user = self.get_by_id(db, user_id)
        if user is None:
            return None
        user.is_active = is_active
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def update_my_profile(self, db: Session, user_id: int, *, full_name: str) -> User | None:
        user = self.get_by_id(db, user_id)
        if user is None:
            return None
        user.full_name = full_name
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    def update_password_hash(self, db: Session, user_id: int, *, password_hash: str) -> User | None:
        user = self.get_by_id(db, user_id)
        if user is None:
            return None
        user.password_hash = password_hash
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


user_repository = UserRepository()
