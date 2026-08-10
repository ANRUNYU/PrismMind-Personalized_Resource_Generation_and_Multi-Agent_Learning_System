from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from app.api.v1.api import router as api_v1_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers, unhandled_exception_response
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.app_debug,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    @app.middleware("http")
    async def add_request_id(request: Request, call_next):
        request_id = request.headers.get(settings.request_id_header) or str(uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[settings.request_id_header] = request_id
        return response

    @app.middleware("http")
    async def handle_unexpected_errors(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            return unhandled_exception_response(request, exc)

    # Keep CORS outermost so even unexpected 500 responses retain their CORS
    # headers instead of being misleadingly reported as browser CORS failures.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.backend_cors_origin_list,
        allow_credentials=True,
        allow_methods=settings.backend_cors_methods,
        allow_headers=settings.backend_cors_headers,
    )

    register_exception_handlers(app)
    app.include_router(api_v1_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
