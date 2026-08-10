import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.utils.response import error_payload

logger = logging.getLogger(__name__)


def unhandled_exception_response(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled request error", exc_info=(type(exc), exc, exc.__traceback__))
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=error_payload(
            code=50000,
            message="服务器内部错误",
            detail=None,
            request=request,
        ),
    )


class AppException(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: int = 40000,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        detail: Any = None,
    ) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        self.detail = detail


class BadRequestException(AppException):
    def __init__(self, message: str = "请求参数不合法", detail: Any = None) -> None:
        super().__init__(message, code=40000, status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "未认证", detail: Any = None) -> None:
        super().__init__(message, code=40100, status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


class ForbiddenException(AppException):
    def __init__(self, message: str = "权限不足", detail: Any = None) -> None:
        super().__init__(message, code=40300, status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class NotFoundException(AppException):
    def __init__(self, message: str = "资源不存在", detail: Any = None) -> None:
        super().__init__(message, code=40400, status_code=status.HTTP_404_NOT_FOUND, detail=detail)


class ConflictException(AppException):
    def __init__(self, message: str = "资源冲突", detail: Any = None) -> None:
        super().__init__(message, code=40900, status_code=status.HTTP_409_CONFLICT, detail=detail)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(
                code=exc.code,
                message=exc.message,
                detail=exc.detail,
                request=request,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.info("Request validation failed: %s", exc.errors())
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=error_payload(
                code=40001,
                message="参数校验失败",
                detail=exc.errors(),
                request=request,
            ),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(
                code=exc.status_code,
                message=str(exc.detail),
                detail=exc.detail,
                request=request,
            ),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return unhandled_exception_response(request, exc)
