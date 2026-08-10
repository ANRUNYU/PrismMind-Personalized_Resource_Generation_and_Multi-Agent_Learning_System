import request from './request'
import type { TaskDetail, TaskListResponse, TaskQuery } from '@/types/task'
import { getToken } from '@/utils/storage'
import { resolveApiBaseURL } from '@/api/baseUrl'
export { consumeNdjsonStream } from '@/utils/taskStream'

export type { TaskCreateResponse, TaskDetail, TaskItem, TaskListResponse, TaskQuery, TaskStatus, TaskType } from '@/types/task'

export function getTasks(params?: TaskQuery) {
  return request.get<TaskListResponse, TaskListResponse>('/tasks', { params })
}

export function getTask(taskId: number | string) {
  return request.get<TaskDetail, TaskDetail>(`/tasks/${taskId}`)
}

export async function fetchTaskStream(taskId: number | string, signal: AbortSignal): Promise<Response> {
  const baseURL = resolveApiBaseURL()
  const token = getToken()
  const response = await fetch(`${baseURL}/tasks/${taskId}/stream`, {
    headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/x-ndjson' } : { Accept: 'application/x-ndjson' },
    signal
  })
  if (!response.ok) throw new Error(`任务流连接失败：HTTP ${response.status}`)
  if (!response.body) throw new Error('浏览器未提供可读取的任务响应流')
  return response
}
