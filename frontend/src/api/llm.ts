import request from './request'
import type { LLMStatus } from '@/types/llm'

export function getLLMStatus() {
  return request.get<LLMStatus, LLMStatus>('/llm/status')
}
