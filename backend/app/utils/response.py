from typing import Any, Optional

from fastapi import Request


def _request_id(request: Optional[Request]) -> str:
    if not request:
        return ""
    return getattr(request.state, "request_id", "")


def success_response(
    *,
    data: Any = None,
    message: str = "success",
    code: int = 0,
    request: Optional[Request] = None,
) -> dict:
    return {
        "code": code,
        "message": message,
        "data": data,
        "request_id": _request_id(request),
    }


def error_payload(
    *,
    code: int,
    message: str,
    detail: Any = None,
    request: Optional[Request] = None,
) -> dict:
    return {
        "code": code,
        "message": message,
        "detail": detail,
        "request_id": _request_id(request),
    }
