from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_db, require_active_user
from app.core.exceptions import BadRequestException, ConflictException, ForbiddenException, NotFoundException
from app.models.enums import FileParseStatus, KnowledgeDocumentStatus, UserRole
from app.models.knowledge import KnowledgeDocument
from app.models.user import User
from app.repositories.course_repository import course_repository
from app.repositories.file_repository import file_repository
from app.repositories.knowledge_repository import knowledge_repository
from app.repositories.task_repository import task_repository
from app.schemas.common import ApiResponse
from app.schemas.file_asset import FileAssetListItem, FileAssetListResponse, FileAssetRead, FileBatchUploadItem, FileBatchUploadResponse, FileDeleteResponse, FileUploadResponse
from app.services.documents.storage import delete_file as delete_stored_file
from app.services.documents.storage import get_file_path, save_upload_file
from app.tasks.document_tasks import parse_file_asset_task
from app.tasks.knowledge_tasks import run_knowledge_ingest_task
from app.utils.response import success_response

router = APIRouter()
ZIP_OFFICE_SUFFIXES = {".docx", ".pptx", ".xlsx"}
OLE_OFFICE_SUFFIXES = {".doc", ".ppt", ".xls"}


def _validate_upload(file: UploadFile) -> str:
    filename = Path(file.filename or "").name
    suffix = Path(filename).suffix.lower()
    if not filename or not suffix or "\x00" in filename:
        raise BadRequestException("上传文件名不合法")
    if suffix not in get_settings().allowed_upload_extension_set:
        raise BadRequestException(f"不支持的文件格式：{suffix}")
    return suffix


async def _validate_file_header(file: UploadFile, suffix: str) -> None:
    header = await file.read(8)
    await file.seek(0)
    valid = True
    if suffix == ".pdf":
        valid = header.startswith(b"%PDF-")
    elif suffix in ZIP_OFFICE_SUFFIXES:
        valid = header.startswith(b"PK")
    elif suffix in OLE_OFFICE_SUFFIXES:
        valid = header.startswith(bytes.fromhex("D0CF11E0A1B11AE1"))
    if not valid:
        raise BadRequestException("文件内容与扩展名不匹配")


def _assert_course_owner(db: Session, course_id: int, current_user: User) -> None:
    course = course_repository.get_by_id(db, course_id)
    if course is None:
        raise NotFoundException("课程不存在")
    if current_user.role != UserRole.admin and course.owner_id != current_user.id:
        raise ForbiddenException("只有课程负责人可以上传并入库课程资料")


def _can_download_course_file(db: Session, *, file_id: int, current_user: User) -> bool:
    course_ids = list(
        db.scalars(
            select(KnowledgeDocument.course_id).where(
                KnowledgeDocument.file_asset_id == file_id,
                KnowledgeDocument.course_id.is_not(None),
            )
        )
    )
    return any(
        course_id is not None
        and course_repository.get_active_membership(db, int(course_id), current_user.id) is not None
        for course_id in course_ids
    )


def _dispatch_parse(file_id: int, force: bool = False) -> None:
    if get_settings().use_celery:
        parse_file_asset_task.apply_async(args=[file_id, force])
    else:
        parse_file_asset_task.run(file_id, force)


@router.get("", response_model=ApiResponse[FileAssetListResponse], summary="List uploaded files for current user")
def list_files(request: Request, asset_type: str | None = None, page: int = 1, page_size: int = 30, db: Session = Depends(get_db), current_user: User = Depends(require_active_user)):
    safe_page, safe_page_size = max(page, 1), min(max(page_size, 1), 100)
    items, total = file_repository.list_by_owner(db, owner_id=current_user.id, asset_type=asset_type, page=safe_page, page_size=safe_page_size)
    return success_response(data=FileAssetListResponse(items=[FileAssetListItem.model_validate(item) for item in items], total=total, page=safe_page, page_size=safe_page_size), request=request)


async def _save_asset(upload: UploadFile, db: Session, current_user: User, asset_type: str):
    suffix = _validate_upload(upload)
    await _validate_file_header(upload, suffix)
    settings = get_settings()
    stored = await save_upload_file(upload, max_size_bytes=settings.max_upload_size_bytes)
    if stored.file_size <= 0:
        delete_stored_file(stored.storage_path)
        raise BadRequestException("上传文件不能为空")
    try:
        asset = file_repository.create_file_asset(db, owner_id=current_user.id, original_filename=stored.original_filename, storage_path=stored.storage_path, content_type=stored.content_type, file_size=stored.file_size, file_hash=stored.file_hash, asset_type=asset_type, parse_status=FileParseStatus.pending)
    except Exception:
        delete_stored_file(stored.storage_path)
        raise
    return stored, asset


@router.post("/upload", response_model=ApiResponse[FileUploadResponse], summary="Upload a file into the file center")
async def upload_file(request: Request, file: UploadFile = File(...), asset_type: str = Form(default="knowledge_source"), description: str | None = Form(default=None), db: Session = Depends(get_db), current_user: User = Depends(require_active_user)):
    _ = description
    _, asset = await _save_asset(file, db, current_user, asset_type)
    try:
        _dispatch_parse(asset.id)
    except Exception as exc:
        file_repository.update_parse_status(db, file_id=asset.id, parse_status=FileParseStatus.failed, parse_error=f"解析任务未能启动：{exc}")
    return success_response(data=FileUploadResponse.model_validate(file_repository.get_by_id(db, asset.id)), request=request)


@router.post("/upload-batch", response_model=ApiResponse[FileBatchUploadResponse], summary="Upload multiple files with partial success")
async def upload_files_batch(request: Request, files: list[UploadFile] = File(...), purpose: str | None = Form(default=None), course_id: int | None = Form(default=None), auto_ingest: bool = Form(default=False), db: Session = Depends(get_db), current_user: User = Depends(require_active_user)):
    settings = get_settings()
    if len(files) > settings.max_batch_upload_files:
        raise BadRequestException(f"单批最多上传 {settings.max_batch_upload_files} 个文件")
    if course_id is not None:
        _assert_course_owner(db, course_id, current_user)
    results: list[FileBatchUploadItem] = []
    total_size = 0
    for upload in files:
        original_name = Path(upload.filename or "").name
        stored = asset = document = None
        try:
            stored, asset = await _save_asset(upload, db, current_user, purpose or "knowledge_source")
            total_size += stored.file_size
            if total_size > settings.max_batch_upload_size_bytes:
                file_repository.delete(db, asset)
                delete_stored_file(stored.storage_path)
                asset = None
                raise BadRequestException("整批文件总大小超过限制")
            if auto_ingest:
                document = knowledge_repository.create_document(
                    db,
                    owner_id=current_user.id,
                    file_asset_id=asset.id,
                    title=Path(asset.original_filename).stem,
                    source_type="course_file" if course_id is not None else "private_file",
                    course_id=course_id,
                    status=KnowledgeDocumentStatus.parsing,
                )
                task = task_repository.create_task(db, owner_id=current_user.id, task_type="knowledge_ingest", input_payload={"document_id": document.id, "file_asset_id": asset.id, "course_id": course_id})
                try:
                    if settings.use_celery:
                        run_knowledge_ingest_task.apply_async(args=[task.id])
                    else:
                        run_knowledge_ingest_task.run(task.id)
                except Exception as exc:
                    task_repository.mark_task_failed(db, task=task, error_message=f"{exc.__class__.__name__}: {exc}")
                    knowledge_repository.update_document_status(db, document_id=document.id, status=KnowledgeDocumentStatus.failed)
                    file_repository.update_parse_status(db, file_id=asset.id, parse_status=FileParseStatus.failed, parse_error="上传成功，但入库任务未能启动")
                    raise RuntimeError("上传成功，但入库任务未能启动") from exc
            else:
                _dispatch_parse(asset.id)
            refreshed = file_repository.get_by_id(db, asset.id) or asset
            results.append(FileBatchUploadItem(original_name=original_name, success=True, file_id=asset.id, parse_status=refreshed.parse_status, knowledge_document_id=document.id if document else None))
        except Exception as exc:
            db.rollback()
            refreshed = file_repository.get_by_id(db, asset.id) if asset else None
            results.append(FileBatchUploadItem(original_name=original_name, success=False, file_id=asset.id if asset else None, parse_status=refreshed.parse_status if refreshed else None, knowledge_document_id=document.id if document else None, error_code="enqueue_failed" if asset and document else "upload_failed", error_message=str(exc)))
    succeeded = sum(item.success for item in results)
    return success_response(data=FileBatchUploadResponse(items=results, succeeded=succeeded, failed=len(results)-succeeded), request=request)


@router.post("/{file_id}/retry-parse", response_model=ApiResponse[FileAssetRead], summary="Retry parsing a failed or stale file")
def retry_parse_file(file_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_active_user)):
    asset = file_repository.get_by_id(db, file_id)
    if asset is None:
        raise NotFoundException("文件不存在")
    if not file_repository.check_owner_or_admin(asset, current_user):
        raise ForbiddenException("无权重试该文件")
    if asset.parse_status != FileParseStatus.parsed:
        file_repository.update_parse_status(db, file_id=file_id, parse_status=FileParseStatus.pending)
        try:
            _dispatch_parse(file_id, True)
        except Exception as exc:
            file_repository.update_parse_status(db, file_id=file_id, parse_status=FileParseStatus.failed, parse_error=f"解析任务未能启动：{exc}")
    return success_response(data=FileAssetRead.model_validate(file_repository.get_by_id(db, file_id)), request=request)


@router.get("/{file_id}", response_model=ApiResponse[FileAssetRead], summary="Get file metadata")
def get_file(file_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_active_user)):
    asset = file_repository.get_by_id(db, file_id)
    if asset is None:
        raise NotFoundException("文件不存在")
    if not file_repository.check_owner_or_admin(asset, current_user):
        raise ForbiddenException("无权访问该文件")
    return success_response(data=FileAssetRead.model_validate(asset), request=request)


@router.get("/{file_id}/download", summary="Download file")
def download_file(file_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_active_user)):
    asset = file_repository.get_by_id(db, file_id)
    if asset is None:
        raise NotFoundException("文件不存在")
    if not file_repository.check_owner_or_admin(asset, current_user) and not _can_download_course_file(
        db,
        file_id=asset.id,
        current_user=current_user,
    ):
        raise ForbiddenException("无权下载该文件")
    path = get_file_path(asset.storage_path)
    if not path.exists():
        raise NotFoundException("文件存储内容不存在")
    return FileResponse(path=path, media_type=asset.content_type or "application/octet-stream", filename=asset.original_filename)


@router.delete("/{file_id}", response_model=ApiResponse[FileDeleteResponse], summary="Delete file metadata and local file")
def delete_file(file_id: int, request: Request, db: Session = Depends(get_db), current_user: User = Depends(require_active_user)):
    asset = file_repository.get_by_id(db, file_id)
    if asset is None:
        raise NotFoundException("文件不存在")
    if not file_repository.check_owner_or_admin(asset, current_user):
        raise ForbiddenException("无权删除该文件")
    if file_repository.has_knowledge_documents(db, file_id):
        raise ConflictException("文件已关联知识库文档，请先删除相关文档")
    delete_stored_file(asset.storage_path)
    file_repository.delete(db, asset)
    return success_response(data=FileDeleteResponse(id=file_id, deleted=True), request=request)
