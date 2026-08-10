import type { AxiosProgressEvent } from 'axios'

import request from './request'
import type {
  AssistantFile,
  AssistantSendMessagePayload,
  AssistantSendMessageResponse,
  AssistantSessionCreatePayload,
  AssistantSessionDetail,
  AssistantSessionListResponse,
  AssistantStreamEvent,
  AssistantMessage
} from '@/types/assistant'
import { getToken } from '@/utils/storage'
import { resolveApiBaseURL } from '@/api/baseUrl'

export interface AssistantSessionListParams {
  page?: number
  page_size?: number
  course_id?: number | null
}

export function listAssistantSessions(params?: AssistantSessionListParams) {
  return request.get<AssistantSessionListResponse, AssistantSessionListResponse>('/assistant/sessions', { params })
}

export function createAssistantSession(payload: AssistantSessionCreatePayload) {
  return request.post<AssistantSessionDetail, AssistantSessionDetail>('/assistant/sessions', payload)
}

export function getAssistantSession(sessionId: number | string) {
  return request.get<AssistantSessionDetail, AssistantSessionDetail>(`/assistant/sessions/${sessionId}`)
}

export function sendAssistantMessage(sessionId: number | string, payload: AssistantSendMessagePayload) {
  return request.post<AssistantSendMessageResponse, AssistantSendMessageResponse>(
    `/assistant/sessions/${sessionId}/messages`,
    payload
  )
}

const apiBaseURL = resolveApiBaseURL()

export async function streamAssistantMessage(
  sessionId: number | string,
  payload: AssistantSendMessagePayload,
  signal: AbortSignal,
  onEvent: (event: AssistantStreamEvent) => void
) {
  const response = await fetch(`${apiBaseURL}/assistant/sessions/${sessionId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
    body: JSON.stringify(payload),
    signal
  })
  if (!response.ok || !response.body) throw new Error(`助手流式请求失败（${response.status}）`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as AssistantStreamEvent)
    if (done) break
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as AssistantStreamEvent)
}

export function cancelAssistantMessage(messageId: number) {
  return request.post<AssistantMessage, AssistantMessage>(`/assistant/messages/${messageId}/cancel`)
}

export function uploadAssistantFile(
  formData: FormData,
  onUploadProgress?: (event: AxiosProgressEvent) => void
) {
  return request.post<AssistantFile, AssistantFile>('/assistant/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  })
}

export function deleteAssistantSession(sessionId: number | string) {
  return request.delete<{ session_id: number; deleted: boolean }, { session_id: number; deleted: boolean }>(
    `/assistant/sessions/${sessionId}`
  )
}
