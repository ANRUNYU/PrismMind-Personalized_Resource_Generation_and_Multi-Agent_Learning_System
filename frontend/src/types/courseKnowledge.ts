export type CourseKnowledgeStatus = 'pending' | 'parsing' | 'ingested' | 'failed' | 'deleted' | string
export type CourseFileParseStatus = 'pending' | 'parsed' | 'failed' | 'deleted' | string

export interface CourseFile {
  id: number
  original_filename: string
  content_type?: string | null
  file_size: number
  asset_type: string
  parse_status: CourseFileParseStatus
  created_at: string
  updated_at: string
  usable_for_course_knowledge: boolean
}

export interface CourseFileListResponse {
  items: CourseFile[]
  total: number
}

export interface CourseKnowledgeDocument {
  id: number
  title: string
  file_id?: number | null
  filename?: string | null
  status: CourseKnowledgeStatus
  chunk_count: number
  created_at: string
  updated_at: string
  owner_name?: string | null
  course_id: number
  ingest_task_id?: number | null
  added_to_personal: boolean
  personal_document_id?: number | null
  personal_document_status?: CourseKnowledgeStatus | null
}

export interface CourseKnowledgeDocumentListResponse {
  items: CourseKnowledgeDocument[]
  total: number
  page: number
  page_size: number
}

export interface CourseKnowledgeDocumentCreatePayload {
  file_id: number
  title?: string | null
  description?: string | null
}

export interface CourseKnowledgeIngestResponse {
  document_id: number
  status: CourseKnowledgeStatus
  chunk_count: number
  chroma_collection: string
}

export interface CourseKnowledgeDeleteResponse {
  document_id: number
  deleted: boolean
  deleted_chunks: number
}

export interface CourseKnowledgeCopyResponse {
  source_document_id: number
  personal_document_id: number
  personal_file_id?: number | null
  status: CourseKnowledgeStatus
  chunk_count: number
  already_added: boolean
}

export interface CourseKnowledgeRetrieveRequest {
  query: string
  top_k?: number
  document_ids?: number[] | null
}

export interface CourseKnowledgeRetrieveResult {
  content: string
  metadata: Record<string, unknown>
  score?: number | null
  document_id?: number | null
  title?: string | null
  filename?: string | null
}

export interface CourseKnowledgeRetrieveResponse {
  query: string
  results: CourseKnowledgeRetrieveResult[]
}
