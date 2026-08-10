import type { AxiosProgressEvent } from 'axios'

import request from './request'

export type FileParseStatus = 'pending' | 'parsing' | 'parsed' | 'failed' | 'deleted' | string

export interface FileAsset {
  id: number
  owner_id: number
  original_filename: string
  content_type?: string | null
  file_size: number
  file_hash: string
  asset_type: string
  parse_status: FileParseStatus
  parse_error?: string | null
  parsed_at?: string | null
  parsed_text_char_count: number
  upload_status?: string
  knowledge_ingest_status?: string | null
  knowledge_document_id?: number | null
  created_at: string
  updated_at?: string
}

export interface FileBatchUploadItem {
  original_name: string
  success: boolean
  file_id?: number | null
  parse_status?: FileParseStatus | null
  knowledge_document_id?: number | null
  error_code?: string | null
  error_message?: string | null
}

export interface FileBatchUploadResponse {
  items: FileBatchUploadItem[]
  succeeded: number
  failed: number
}

export interface FileDeleteResponse {
  id: number
  deleted: boolean
}

export interface FileListResponse {
  items: FileAsset[]
  total: number
  page: number
  page_size: number
}

export function listFiles(params?: { page?: number; page_size?: number; asset_type?: string }) {
  return request.get<FileListResponse, FileListResponse>('/files', { params })
}

export function uploadFile(formData: FormData, onUploadProgress?: (event: AxiosProgressEvent) => void) {
  return request.post<FileAsset, FileAsset>('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  })
}

export function uploadFileApi(formData: FormData, onUploadProgress?: (event: AxiosProgressEvent) => void) {
  return uploadFile(formData, onUploadProgress)
}

export function uploadFilesBatch(formData: FormData, onUploadProgress?: (event: AxiosProgressEvent) => void) {
  return request.post<FileBatchUploadResponse, FileBatchUploadResponse>('/files/upload-batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  })
}

export function retryParseFile(fileId: number) {
  return request.post<FileAsset, FileAsset>(`/files/${fileId}/retry-parse`)
}

export function getFile(fileId: number) {
  return request.get<FileAsset, FileAsset>(`/files/${fileId}`)
}

export function downloadFile(fileId: number) {
  return request.get<Blob, Blob>(`/files/${fileId}/download`, {
    responseType: 'blob'
  })
}

export function deleteFile(fileId: number) {
  return request.delete<FileDeleteResponse, FileDeleteResponse>(`/files/${fileId}`)
}
