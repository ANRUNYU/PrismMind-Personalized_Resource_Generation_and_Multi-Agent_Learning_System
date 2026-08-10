export type AssistantMode = 'general' | 'course_qa' | 'file_qa'
export type AssistantRole = 'user' | 'assistant' | 'system'
export type AssistantAnswerStyle = 'normal' | 'step_by_step' | 'concise' | 'detailed'

export interface AssistantReference {
  source_type: 'course_knowledge' | 'file'
  title?: string | null
  filename?: string | null
  excerpt: string
  score?: number | null
  document_id?: number | null
  file_id?: number | null
  chunk_index?: number | null
}

export interface AssistantUsedDocument {
  title?: string | null
  filename?: string | null
  source_type: 'course_knowledge' | 'file'
}

export interface AssistantMessage {
  id: number
  session_id: number
  role: AssistantRole | string
  content: string
  status?: 'running' | 'completed' | 'failed' | 'cancelled' | string
  error_message?: string | null
  completed_at?: string | null
  references: AssistantReference[]
  attachment_file_ids: number[]
  created_at: string
  updated_at: string
}

export type AssistantStreamEvent =
  | { type: 'meta'; stream_supported: boolean; user_message: AssistantMessage; assistant_message: AssistantMessage; warnings: string[] }
  | { type: 'delta'; text: string }
  | { type: 'references'; references: AssistantReference[] }
  | { type: 'warning'; message: string }
  | { type: 'done'; message: AssistantMessage; references: AssistantReference[] }
  | { type: 'error'; message: string; retryable?: boolean }

export interface AssistantSessionSummary {
  id: number
  user_id: number
  course_id?: number | null
  title: string
  mode: AssistantMode | string
  status: string
  last_message?: string | null
  message_count: number
  created_at: string
  updated_at: string
}

export interface AssistantSessionDetail extends AssistantSessionSummary {
  messages: AssistantMessage[]
}

export interface AssistantSessionListResponse {
  items: AssistantSessionSummary[]
  total: number
  page: number
  page_size: number
}

export interface AssistantSessionCreatePayload {
  course_id?: number | null
  title?: string | null
  mode?: AssistantMode
}

export interface AssistantSendMessagePayload {
  message: string
  course_id?: number | null
  use_course_knowledge?: boolean
  knowledge_document_ids?: number[]
  attachment_file_ids?: number[]
  answer_style?: AssistantAnswerStyle
  top_k?: number
}

export interface AssistantSendMessageResponse {
  session: AssistantSessionSummary
  user_message: AssistantMessage
  assistant_message: AssistantMessage
  answer: string
  references: AssistantReference[]
  used_documents: AssistantUsedDocument[]
  suggested_followups: string[]
  warnings: string[]
}

export interface AssistantFile {
  id: number
  original_filename: string
  content_type?: string | null
  file_size: number
  file_hash: string
  asset_type: string
  parse_status: string
  created_at: string
  updated_at: string
}
