from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    message: str = "success"
    data: Optional[T] = None
    request_id: str = Field(default="")


class ApiError(BaseModel):
    code: int
    message: str
    detail: Any = None
    request_id: str = Field(default="")
