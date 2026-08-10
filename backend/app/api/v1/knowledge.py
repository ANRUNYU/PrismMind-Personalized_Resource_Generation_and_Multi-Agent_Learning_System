from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_active_user
from app.core.exceptions import AppException, BadRequestException, ForbiddenException, NotFoundException
from app.models.enums import KnowledgeDocumentStatus, UserRole
from app.models.user import User
from app.repositories.file_repository import file_repository
from app.repositories.knowledge_repository import knowledge_repository
from app.repositories.task_repository import task_repository
from app.schemas.common import ApiResponse
from app.schemas.knowledge import (
    KnowledgeDeleteResponse,
    KnowledgeDocumentCreate,
    KnowledgeDocumentListResponse,
    KnowledgeDocumentRead,
    KnowledgeIngestResponse,
    KnowledgeRetrieveRequest,
    KnowledgeRetrieveResponse,
    KnowledgeRetrieveResult,
)
from app.schemas.task import TaskCreateResponse
from app.services.rag.chroma_store import ChromaStoreError
from app.services.rag.chroma_store import delete_by_document_id as delete_chroma_by_document_id
from app.services.rag.ingestion import ingest_document
from app.services.rag.retriever import retrieve
from app.services.knowledge.models import EvidencePack, RetrievalRequest
from app.services.knowledge.service import KnowledgeAccessError, KnowledgeService
from app.tasks.knowledge_tasks import run_knowledge_ingest_task
from app.utils.response import success_response

router = APIRouter()


@router.post(
    "/evidence",
    response_model=ApiResponse[EvidencePack],
    summary="Retrieve permission-checked, gated evidence for an Agent",
)
def retrieve_agent_evidence(
    payload: RetrievalRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    try:
        pack = KnowledgeService(db).retrieve_for_agent(
            agent_role=payload.agent_role, user=current_user, course_id=payload.course_id,
            query=payload.query, document_ids=payload.document_ids, top_k=payload.top_k,
            policy=payload.policy,
        )
    except KnowledgeAccessError as exc:
        raise ForbiddenException(str(exc)) from exc
    return success_response(data=pack, request=request)


def _get_accessible_document(db: Session, document_id: int, current_user: User):
    document = knowledge_repository.get_document(db, document_id)
    if document is None:
        raise NotFoundException("知识库文档不存在")
    if not knowledge_repository.check_owner_or_admin(document, current_user):
        raise ForbiddenException("无权访问该知识库文档")
    return document


@router.post(
    "/documents",
    response_model=ApiResponse[KnowledgeDocumentRead],
    summary="Create a knowledge document from an uploaded file",
)
def create_knowledge_document(
    payload: KnowledgeDocumentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    file_asset = file_repository.get_by_id(db, payload.file_id)
    if file_asset is None:
        raise NotFoundException("文件不存在")
    if not file_repository.check_owner_or_admin(file_asset, current_user):
        raise ForbiddenException("无权使用该文件")

    document = knowledge_repository.create_document(
        db,
        owner_id=current_user.id,
        file_asset_id=file_asset.id,
        title=payload.title,
        source_type=payload.source_type,
        course_id=payload.course_id,
        status=KnowledgeDocumentStatus.pending,
    )
    return success_response(data=KnowledgeDocumentRead.model_validate(document), request=request)


@router.get(
    "/documents",
    response_model=ApiResponse[KnowledgeDocumentListResponse],
    summary="List knowledge documents",
)
def list_knowledge_documents(
    request: Request,
    course_id: int | None = Query(default=None),
    document_status: KnowledgeDocumentStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    items, total = knowledge_repository.list_documents(
        db,
        owner_id=current_user.id,
        include_all=current_user.role == UserRole.admin,
        course_id=course_id,
        status=document_status,
        page=page,
        page_size=page_size,
    )
    data = KnowledgeDocumentListResponse(
        items=[KnowledgeDocumentRead.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
    return success_response(data=data, request=request)


@router.get(
    "/documents/{document_id}",
    response_model=ApiResponse[KnowledgeDocumentRead],
    summary="Get knowledge document detail",
)
def get_knowledge_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    document = _get_accessible_document(db, document_id, current_user)
    return success_response(data=KnowledgeDocumentRead.model_validate(document), request=request)


@router.post(
    "/documents/{document_id}/ingest",
    response_model=ApiResponse[KnowledgeIngestResponse],
    summary="Parse document and ingest chunks into Chroma",
)
def ingest_knowledge_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    document = _get_accessible_document(db, document_id, current_user)
    if document.file_asset_id is None:
        raise BadRequestException("知识库文档没有来源文件")
    file_asset = file_repository.get_by_id(db, document.file_asset_id)
    if file_asset is None:
        raise NotFoundException("来源文件不存在")

    try:
        chunk_count = ingest_document(db, document=document, file_asset=file_asset)
    except Exception as exc:
        raise AppException(
            "知识库入库失败",
            code=50020,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    refreshed_document = knowledge_repository.get_document(db, document_id)
    data = KnowledgeIngestResponse(
        document_id=document_id,
        status=refreshed_document.status if refreshed_document else KnowledgeDocumentStatus.ingested,
        chunk_count=chunk_count,
        chroma_collection=refreshed_document.chunks[0].chroma_collection
        if refreshed_document and refreshed_document.chunks
        else "edugenie_knowledge",
    )
    return success_response(data=data, request=request)


@router.post(
    "/documents/{document_id}/ingest-async",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Create an async task to ingest a knowledge document into Chroma",
)
def ingest_knowledge_document_async(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    document = _get_accessible_document(db, document_id, current_user)
    if document.status == KnowledgeDocumentStatus.parsing:
        raise BadRequestException("知识库文档正在入库，请稍后再试")
    if document.file_asset_id is None:
        raise BadRequestException("知识库文档没有来源文件")

    file_asset = file_repository.get_by_id(db, document.file_asset_id)
    if file_asset is None:
        raise NotFoundException("来源文件不存在")
    if not file_repository.check_owner_or_admin(file_asset, current_user):
        raise ForbiddenException("无权使用该文件")

    task = task_repository.create_task(
        db,
        owner_id=document.owner_id,
        task_type="knowledge_ingest",
        input_payload={
            "document_id": document.id,
            "file_asset_id": file_asset.id,
            "owner_id": document.owner_id,
            "course_id": document.course_id,
            "title": document.title,
            "source_type": document.source_type,
            "original_filename": file_asset.original_filename,
        },
    )
    knowledge_repository.update_document_status(
        db,
        document_id=document.id,
        status=KnowledgeDocumentStatus.parsing,
    )
    try:
        run_knowledge_ingest_task.apply_async(args=[task.id])
    except Exception as exc:
        task_repository.mark_task_failed(db, task=task, error_message=f"{exc.__class__.__name__}: {exc}")
        knowledge_repository.update_document_status(
            db,
            document_id=document.id,
            status=KnowledgeDocumentStatus.failed,
        )
        raise AppException(
            "异步入库任务提交失败，请检查 Redis 和 Celery 配置。",
            code=50301,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.__class__.__name__,
        ) from exc

    return success_response(
        data=TaskCreateResponse(
            task_id=task.id,
            task_type=task.task_type,
            status=task.status,
            polling_url=f"/api/v1/tasks/{task.id}",
            stream_url=f"/api/v1/tasks/{task.id}/stream",
        ),
        request=request,
    )


@router.post(
    "/documents/{document_id}/retry-ingest",
    response_model=ApiResponse[TaskCreateResponse],
    summary="Retry a failed knowledge document ingestion",
)
def retry_knowledge_document_ingest(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    document = _get_accessible_document(db, document_id, current_user)
    if document.status == KnowledgeDocumentStatus.ingested:
        raise BadRequestException("文档已成功入库，无需重试")
    knowledge_repository.update_document_status(db, document_id=document.id, status=KnowledgeDocumentStatus.failed)
    return ingest_knowledge_document_async(document_id, request, db, current_user)


@router.delete(
    "/documents/{document_id}",
    response_model=ApiResponse[KnowledgeDeleteResponse],
    summary="Delete knowledge document and Chroma chunks",
)
def delete_knowledge_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    document = _get_accessible_document(db, document_id, current_user)
    try:
        delete_chroma_by_document_id(owner_id=document.owner_id, document_id=document.id)
    except ChromaStoreError as exc:
        raise AppException(
            "Failed to delete Chroma chunks",
            code=50021,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    deleted_chunks = knowledge_repository.delete_chunks_by_document(db, document_id)
    knowledge_repository.delete_document(db, document)
    return success_response(
        data=KnowledgeDeleteResponse(document_id=document_id, deleted=True, deleted_chunks=deleted_chunks),
        request=request,
    )


@router.post(
    "/retrieve",
    response_model=ApiResponse[KnowledgeRetrieveResponse],
    summary="Retrieve chunks from the current user's knowledge base",
)
def retrieve_knowledge(
    payload: KnowledgeRetrieveRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_active_user),
):
    owner_id_for_query = current_user.id
    if payload.document_id is not None:
        document = _get_accessible_document(db, payload.document_id, current_user)
        if document.owner_id != current_user.id and current_user.role != UserRole.admin:
            raise ForbiddenException("无权检索该知识库文档")
        owner_id_for_query = document.owner_id

    try:
        results = retrieve(
            query=payload.query,
            owner_id=owner_id_for_query,
            course_id=payload.course_id,
            document_id=payload.document_id,
            top_k=payload.top_k,
        )
    except ChromaStoreError as exc:
        raise AppException(
            "知识库检索失败",
            code=50022,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    data = KnowledgeRetrieveResponse(
        query=payload.query,
        results=[KnowledgeRetrieveResult(**result) for result in results],
    )
    return success_response(data=data, request=request)
