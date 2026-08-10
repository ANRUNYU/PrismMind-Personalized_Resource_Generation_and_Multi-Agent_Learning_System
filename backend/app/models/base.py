from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, JSON, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import Mapped, mapped_column


JSONDict = MutableDict.as_mutable(JSON().with_variant(JSONB(none_as_null=True), "postgresql"))
JSONList = MutableList.as_mutable(JSON().with_variant(JSONB(none_as_null=True), "postgresql"))
JSONValue = JSON().with_variant(JSONB(none_as_null=True), "postgresql")


class IdMixin:
    id: Mapped[int] = mapped_column(primary_key=True, index=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


def dict_default() -> dict[str, Any]:
    return {}


def list_default() -> list[Any]:
    return []
