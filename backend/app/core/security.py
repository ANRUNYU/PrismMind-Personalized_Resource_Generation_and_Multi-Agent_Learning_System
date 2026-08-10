from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings
from app.models.enums import UserRole


def get_password_hash(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("Password is too long for bcrypt")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        return False
    return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))


def _get_secret_key() -> str:
    secret_key = get_settings().secret_key
    if not secret_key:
        raise RuntimeError("SECRET_KEY is not configured")
    return secret_key


def _create_token(
    *,
    subject: str | int,
    role: str | UserRole,
    token_type: str,
    expires_delta: timedelta,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(subject),
        "role": str(role),
        "token_type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    settings = get_settings()
    return jwt.encode(payload, _get_secret_key(), algorithm=settings.jwt_algorithm)


def create_access_token(
    subject: str | int,
    role: str | UserRole,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    delta = expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    return _create_token(subject=subject, role=role, token_type="access", expires_delta=delta)


def create_refresh_token(
    subject: str | int,
    role: str | UserRole,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    delta = expires_delta or timedelta(days=settings.refresh_token_expire_days)
    return _create_token(subject=subject, role=role, token_type="refresh", expires_delta=delta)


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, _get_secret_key(), algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid token") from exc
    return payload
