import request from './request'
import type { TaskCreateResponse } from '@/types/task'

export type KnowledgeDocumentStatus = 'pending' | 'created' | 'ingesting' | 'ingested' | 'failed' | string

export interface KnowledgeDocument {
  id: number
  owner_id: number
  course_id?: number | null
  file_asset_id?: number | null
  title: string
  source_type: string
  status: KnowledgeDocumentStatus
  chunk_count: number
  created_at: string
  updated_at: string
}

export interface KnowledgeDocumentCreateRequest {
  file_id: number
  course_id?: number | null
  title: string
  source_type?: string
}

export interface KnowledgeDocumentListResponse {
  items: KnowledgeDocument[]
  total: number
  page: number
  page_size: number
}

export interface KnowledgeIngestResponse {
  document_id: number
  status: KnowledgeDocumentStatus
  chunk_count: number
  chroma_collection: string
}

export interface KnowledgeDeleteResponse {
  document_id: number
  deleted: boolean
  deleted_chunks: number
}

export interface KnowledgeRetrieveRequest {
  query: string
  course_id?: number | null
  document_id?: number | null
  top_k?: number
}

export interface KnowledgeReferenceResult {
  content: string
  metadata: {
    owner_id?: number
    course_id?: number | null
    document_id?: number
    chunk_index?: number
    source_filename?: string
    file_id?: number
    [key: string]: unknown
  }
  score?: number | null
}

export interface KnowledgeRetrieveResponse {
  query: string
  results: KnowledgeReferenceResult[]
}

export function createKnowledgeDocument(payload: KnowledgeDocumentCreateRequest) {
  return request.post<KnowledgeDocument, KnowledgeDocument>('/knowledge/documents', payload)
}

export function getKnowledgeDocuments(params?: {
  course_id?: number | null
  status?: string | null
  page?: number
  page_size?: number
}) {
  return request.get<KnowledgeDocumentListResponse, KnowledgeDocumentListResponse>('/knowledge/documents', { params })
}

export function listKnowledgeDocuments(params?: Record<string, unknown>) {
  return getKnowledgeDocuments(params)
}

export function getKnowledgeDocument(id: number) {
  return request.get<KnowledgeDocument, KnowledgeDocument>(`/knowledge/documents/${id}`)
}

export function ingestKnowledgeDocument(id: number) {
  return request.post<KnowledgeIngestResponse, KnowledgeIngestResponse>(`/knowledge/documents/${id}/ingest`)
}

export function ingestKnowledgeDocumentAsync(id: number) {
  return request.post<TaskCreateResponse, TaskCreateResponse>(`/knowledge/documents/${id}/ingest-async`)
}

export function retryKnowledgeDocumentIngest(id: number) {
  return request.post<TaskCreateResponse, TaskCreateResponse>(`/knowledge/documents/${id}/retry-ingest`)
}

export function deleteKnowledgeDocument(id: number) {
  return request.delete<KnowledgeDeleteResponse, KnowledgeDeleteResponse>(`/knowledge/documents/${id}`)
}

export function retrieveKnowledge(payload: KnowledgeRetrieveRequest) {
  return request.post<KnowledgeRetrieveResponse, KnowledgeRetrieveResponse>('/knowledge/retrieve', payload)
}
