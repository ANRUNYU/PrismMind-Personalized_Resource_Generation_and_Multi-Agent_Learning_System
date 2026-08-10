import request from './request'
import { getToken } from '@/utils/storage'
import { resolveApiBaseURL } from '@/api/baseUrl'

export type TutoringMode = 'ask' | 'hint' | 'explain'
export type TutoringDifficulty = 'easy' | 'normal' | 'advanced'
export type TutoringResponseFormat = 'markdown' | 'plain'

export interface TutoringKnowledgeOptions {
  course_id?: number | null
  knowledge_document_ids?: number[] | null
  use_knowledge_base?: boolean
  top_k?: number
  difficulty?: TutoringDifficulty
}

export interface TutoringAskRequest extends TutoringKnowledgeOptions {
  question: string
  response_format?: TutoringResponseFormat
}

export interface TutoringHintRequest extends TutoringKnowledgeOptions {
  question: string
  context?: string | null
  response_format?: TutoringResponseFormat
}

export interface TutoringExplainRequest extends TutoringKnowledgeOptions {
  concept: string
  response_format?: TutoringResponseFormat
}

export interface TutoringReference {
  document_id?: number | null
  chunk_index?: number | null
  source_filename?: string | null
  excerpt?: string | null
  score?: number | null
}

export interface TutoringResponse {
  session_id: number
  question?: string
  concept?: string
  answer?: string
  hint?: string
  explanation?: string
  references: TutoringReference[]
  warnings?: string[]
  used_knowledge_base: boolean
  response_format: TutoringResponseFormat
  created_at: string
}

export interface TutoringSession {
  id: number
  user_id: number
  course_id?: number | null
  topic?: string | null
  session_type: TutoringMode | string
  user_question: string
  ai_response: string
  response_format: string
  context_refs: TutoringReference[]
  is_helpful?: boolean | null
  user_rating?: number | null
  created_at: string
  updated_at: string
}

export interface TutoringSessionListResponse {
  items: TutoringSession[]
  total: number
  page: number
  page_size: number
}

export interface TutoringRatingRequest {
  is_helpful: boolean
  user_rating: number
}

export interface TutoringRatingResponse {
  session_id: number
  is_helpful: boolean
  user_rating: number
}

export function askTutoring(payload: TutoringAskRequest) {
  return request.post<TutoringResponse, TutoringResponse>('/student/tutoring/ask', payload)
}

export function getTutoringHint(payload: TutoringHintRequest) {
  return request.post<TutoringResponse, TutoringResponse>('/student/tutoring/hint', payload)
}

export function explainConcept(payload: TutoringExplainRequest) {
  return request.post<TutoringResponse, TutoringResponse>('/student/tutoring/explain', payload)
}

export function getTutoringSessions(params?: {
  page?: number
  page_size?: number
  topic?: string
  session_type?: TutoringMode | ''
}) {
  return request.get<TutoringSessionListResponse, TutoringSessionListResponse>('/student/tutoring/sessions', { params })
}

export function listTutoringSessions(params?: Record<string, unknown>) {
  return request.get('/student/tutoring/sessions', { params })
}

export function rateTutoringSession(sessionId: number, payload: TutoringRatingRequest) {
  return request.post<TutoringRatingResponse, TutoringRatingResponse>(`/student/tutoring/sessions/${sessionId}/rating`, payload)
}

export interface TutoringMessageRecord { id:number; conversation_id:number; role:'user'|'assistant'; content:string; status:string; references:TutoringReference[]; warnings:string[]; error?:string|null; client_message_id?:string|null; created_at:string; updated_at:string }
export interface TutoringConversation { id:number; user_id:number; course_id?:number|null; title:string; messages:TutoringMessageRecord[]; created_at:string; updated_at:string }
export type TutoringStreamEvent = { type:'meta'|'delta'|'reference'|'warning'|'done'|'error'; text?:string; error?:string; assistant_message_id?:number; message?:TutoringMessageRecord }

export function createTutoringConversation(payload: { title:string; course_id?:number|null }) { return request.post<TutoringConversation,TutoringConversation>('/student/tutoring/conversations',payload) }
export function getTutoringConversations() { return request.get<TutoringConversation[],TutoringConversation[]>('/student/tutoring/conversations') }
export function getTutoringConversation(id:number) { return request.get<TutoringConversation,TutoringConversation>(`/student/tutoring/conversations/${id}`) }
export async function streamTutoringMessage(id:number,payload:{content:string;client_message_id:string;retry_assistant_message_id?:number|null},signal:AbortSignal) {
  const baseURL=resolveApiBaseURL(); const token=getToken()
  const response=await fetch(`${baseURL}/student/tutoring/conversations/${id}/messages/stream`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(payload),signal})
  if(!response.ok||!response.body) throw new Error(`辅导流连接失败：HTTP ${response.status}`)
  return response
}
