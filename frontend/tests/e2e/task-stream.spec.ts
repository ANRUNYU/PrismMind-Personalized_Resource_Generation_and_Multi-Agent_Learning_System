import { expect, test } from '@playwright/test'

import { applyTaskEvent, consumeNdjsonStream } from '../../src/utils/taskStream'
import type { TaskDetail } from '../../src/types/task'

function task(): TaskDetail {
  return { id: 1, task_type: 'teacher_course_design', status: 'running', progress: 45, created_at: new Date().toISOString(), partial_content: '' }
}

test('NDJSON parser handles fragmented network chunks', async () => {
  const encoder = new TextEncoder()
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"type":"delta","task_id":1,"text":"第一'))
      controller.enqueue(encoder.encode('段"}\n{"type":"done","task_id":1,"result_payload":{"artifact_id":7}}\n'))
      controller.close()
    }
  }))
  const events: string[] = []
  await consumeNdjsonStream(response, (event) => events.push(event.type))
  expect(events).toEqual(['delta', 'done'])
})

test('reconnect event ids do not duplicate delta and snapshot replaces content', () => {
  const value = task()
  const warnings: string[] = []
  const references: Record<string, unknown>[] = []
  const seen = new Set<string>()
  applyTaskEvent(value, { type: 'delta', task_id: 1, event_id: 'same', text: '内容' }, warnings, references, seen)
  applyTaskEvent(value, { type: 'delta', task_id: 1, event_id: 'same', text: '内容' }, warnings, references, seen)
  expect(value.partial_content).toBe('内容')
  applyTaskEvent(value, { type: 'meta', task_id: 1, snapshot: true, text: '数据库完整快照', progress: 60 }, warnings, references, seen)
  expect(value.partial_content).toBe('数据库完整快照')
  expect(value.progress).toBe(60)
})
