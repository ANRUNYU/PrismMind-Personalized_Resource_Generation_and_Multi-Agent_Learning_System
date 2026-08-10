import type { TaskDetail, TaskStreamEvent } from '@/types/task'

export async function consumeNdjsonStream<T = TaskStreamEvent>(response: Response, onEvent: (event: T) => void): Promise<void> {
  if (!response.body) throw new Error('响应没有可读流')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as T)
    if (done) break
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as T)
}

export function applyTaskEvent(task: TaskDetail, event: TaskStreamEvent, warnings: string[], references: Record<string, unknown>[], seen: Set<string>): boolean {
  if (event.event_id && seen.has(event.event_id)) return false
  if (event.event_id) seen.add(event.event_id)
  if (event.stage !== undefined) task.current_stage = event.stage
  if (event.progress !== undefined && event.progress !== null) task.progress = event.progress
  if (event.message !== undefined) task.status_message = event.message
  if (event.status) task.status = event.status
  if (event.type === 'meta' && event.snapshot) task.partial_content = event.text || ''
  else if (event.type === 'delta' && event.text) task.partial_content = `${task.partial_content || ''}${event.text}`
  if (event.type === 'warning' && event.message && !warnings.includes(event.message)) warnings.push(event.message)
  if (event.type === 'reference' && event.reference) references.push(event.reference)
  if (event.result_payload) task.result_payload = event.result_payload
  if (event.type === 'done') task.status = 'success'
  if (event.type === 'error') { task.status = 'failed'; task.error_message = event.error || event.message || '任务执行失败' }
  return true
}
