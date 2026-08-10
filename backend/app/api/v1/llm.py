from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.deps import require_active_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.llm import LLMStatusResponse
from app.services.llm.provider import llm_provider
from app.services.llm.model_registry import model_registry
from app.utils.response import success_response

router = APIRouter()


@router.get(
    "/status",
    response_model=ApiResponse[LLMStatusResponse],
    summary="Get LLM provider status",
)
def get_llm_status(
    request: Request,
    current_user: User = Depends(require_active_user),
):
    _ = current_user
    status = llm_provider.get_provider_status()
    status["roles"] = model_registry.status()
    return success_response(data=LLMStatusResponse(**status), request=request)
