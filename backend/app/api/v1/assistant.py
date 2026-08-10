from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_active_user
from app.models.user import User
from app.schemas.assistant import (
    AssistantDeleteResponse,
    AssistantFileUploadResponse,
    AssistantSendMessageRequest,
    AssistantSendMessageResponse,
    AssistantMessageRead,
    AssistantSessionCreate,
    AssistantSessionDetail,
    AssistantSessionListResponse,
)
from app.schemas.common import ApiResponse
from app.services.assistant_service import assistant_service
from app.services.llm.provider import LLMStreamUnsupportedError, llm_provider
from app.repositories.assistant_repository import assistant_repository
from app.utils.response import success_response

router = APIRouter()


@router.get(
    "/sessions",
    response_model=ApiResponse[AssistantSessionListResponse],
    summary="List assistant chat sessions for the current user",
)
def list_assistant_sessions(
    request: Request,
    course_id: int | None = Query(default=None, gt=0),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = assistant_service.list_sessions(
        db,
        current_user=current_user,
        course_id=course_id,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.post(
    "/sessions",
    response_model=ApiResponse[AssistantSessionDetail],
    status_code=status.HTTP_201_CREATED,
    summary="Create an assistant chat session",
)
def create_assistant_session(
    payload: AssistantSessionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = assistant_service.create_session(db, payload=payload, current_user=current_user)
    return success_response(data=data, request=request)


@router.get(
    "/sessions/{session_id}",
    response_model=ApiResponse[AssistantSessionDetail],
    summary="Get assistant session history",
)
def get_assistant_session(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = assistant_service.get_session_detail(db, session_id=session_id, current_user=current_user)
    return success_response(data=data, request=request)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=ApiResponse[AssistantSendMessageResponse],
    summary="Send a message to the smart assistant",
)
def send_assistant_message(
    session_id: int,
    payload: AssistantSendMessageRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = assistant_service.send_message(
        db,
        session_id=session_id,
        payload=payload,
        current_user=current_user,
    )
    return success_response(data=data, request=request)


@router.post(
    "/sessions/{session_id}/messages/stream",
    summary="Stream a smart-assistant reply as NDJSON",
)
async def stream_assistant_message(
    session_id: int,
    payload: AssistantSendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    context = assistant_service.prepare_stream(
        db, session_id=session_id, payload=payload, current_user=current_user,
    )

    def encode(event: dict) -> bytes:
        return (json.dumps(event, ensure_ascii=False, default=str) + "\n").encode("utf-8")

    async def events():
        content = ""
        persisted_length = 0
        last_flush = time.monotonic()
        try:
            yield encode({
                "type": "meta",
                "stream_supported": llm_provider.stream_supported,
                "user_message": assistant_service._message_read(context.user_message).model_dump(mode="json"),
                "assistant_message": assistant_service._message_read(context.assistant_message).model_dump(mode="json"),
                "warnings": context.warnings,
            })
            if context.references:
                yield encode({"type": "references", "references": [item.model_dump(mode="json") for item in context.references]})
            try:
                async for chunk in llm_provider.stream_text(
                    context.prompt, system_prompt=assistant_service.system_prompt, temperature=0.25,
                ):
                    content += chunk
                    yield encode({"type": "delta", "text": chunk})
                    now = time.monotonic()
                    if len(content) - persisted_length >= 200 or now - last_flush >= 0.25:
                        assistant_repository.update_message(db, context.assistant_message, content=content, status="running")
                        persisted_length = len(content)
                        last_flush = now
            except LLMStreamUnsupportedError:
                result = llm_provider.generate_text(
                    context.prompt, system_prompt=assistant_service.system_prompt,
                    temperature=0.25, fallback=context.fallback,
                )
                content = result.content
                yield encode({"type": "warning", "message": "当前 Provider 不支持流式输出，已返回一次性完整结果。"})
                yield encode({"type": "delta", "text": content})

            message = assistant_service.finish_stream_message(
                db, context.assistant_message.id, content=content, references=context.references,
            )
            yield encode({
                "type": "done",
                "message": assistant_service._message_read(message).model_dump(mode="json"),
                "references": [item.model_dump(mode="json") for item in context.references],
            })
        except asyncio.CancelledError:
            assistant_service.fail_stream_message(
                db, context.assistant_message.id, content=content,
                error="客户端已断开或用户停止生成", cancelled=True,
            )
            raise
        except Exception as exc:
            message = assistant_service.fail_stream_message(
                db, context.assistant_message.id, content=content,
                error=f"{exc.__class__.__name__}: {exc}",
            )
            yield encode({
                "type": "error", "message": message.error_message if message else "生成失败",
                "retryable": True,
            })

    return StreamingResponse(events(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache"})


@router.post(
    "/messages/{message_id}/cancel",
    response_model=ApiResponse[AssistantMessageRead],
    summary="Cancel a running assistant message",
)
def cancel_assistant_message(
    message_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = assistant_service.cancel_message(db, message_id=message_id, current_user=current_user)
    return success_response(data=data, request=request)


@router.post(
    "/files/upload",
    response_model=ApiResponse[AssistantFileUploadResponse],
    summary="Upload a temporary assistant attachment",
)
async def upload_assistant_file(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = await assistant_service.upload_attachment(db, upload_file=file, current_user=current_user)
    return success_response(data=data, request=request)


@router.delete(
    "/sessions/{session_id}",
    response_model=ApiResponse[AssistantDeleteResponse],
    summary="Delete an assistant chat session",
)
def delete_assistant_session(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    data = assistant_service.delete_session(db, session_id=session_id, current_user=current_user)
    return success_response(data=data, request=request)
