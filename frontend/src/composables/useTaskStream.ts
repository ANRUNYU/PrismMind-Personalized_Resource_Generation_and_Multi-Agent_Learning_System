import { onBeforeUnmount, ref, type Ref } from 'vue'

import { consumeNdjsonStream, fetchTaskStream, getTask } from '@/api/tasks'
import type { TaskDetail } from '@/types/task'
import { applyTaskEvent } from '@/utils/taskStream'

export interface TaskStreamState {
  task: Ref<TaskDetail | null>
  warnings: Ref<string[]>
  references: Ref<Record<string, unknown>[]>
  streaming: Ref<boolean>
  usingPolling: Ref<boolean>
  error: Ref<string | null>
  start: (taskId: number) => Promise<void>
  stop: () => void
}

export function useTaskStream(maxReconnects = 3, pollingIntervalMs = 2500): TaskStreamState {
  const task = ref<TaskDetail | null>(null)
  const warnings = ref<string[]>([])
  const references = ref<Record<string, unknown>[]>([])
  const streaming = ref(false)
  const usingPolling = ref(false)
  const error = ref<string | null>(null)
  const seen = new Set<string>()
  let controller: AbortController | null = null
  let timer: number | undefined
  let doneConsumed = false

  function stop() {
    controller?.abort()
    controller = null
    if (timer) window.clearTimeout(timer)
    timer = undefined
    streaming.value = false
  }

  async function poll(taskId: number) {
    usingPolling.value = true
    const snapshot = await getTask(taskId)
    task.value = snapshot
    if (snapshot.status === 'success' || snapshot.status === 'failed') return
    timer = window.setTimeout(() => void poll(taskId), pollingIntervalMs)
  }

  async function connect(taskId: number, attempt: number): Promise<void> {
    controller = new AbortController()
    streaming.value = true
    try {
      const response = await fetchTaskStream(taskId, controller.signal)
      await consumeNdjsonStream(response, (event) => {
        if (!task.value) return
        if (event.type === 'done' && doneConsumed) return
        if (event.type === 'done') doneConsumed = true
        applyTaskEvent(task.value, event, warnings.value, references.value, seen)
      })
      if (!doneConsumed && task.value?.status !== 'failed') throw new Error('任务流意外断开')
    } catch (cause) {
      if (controller?.signal.aborted) return
      if (attempt < maxReconnects) return connect(taskId, attempt + 1)
      error.value = cause instanceof Error ? cause.message : '任务流连接失败'
      await poll(taskId)
    } finally { streaming.value = false }
  }

  async function start(taskId: number) {
    stop()
    warnings.value = []
    references.value = []
    error.value = null
    usingPolling.value = false
    doneConsumed = false
    seen.clear()
    task.value = await getTask(taskId)
    if (task.value.status !== 'success' && task.value.status !== 'failed') await connect(taskId, 0)
  }

  onBeforeUnmount(stop)
  return { task, warnings, references, streaming, usingPolling, error, start, stop }
}
