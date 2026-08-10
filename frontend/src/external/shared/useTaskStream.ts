import { useCallback, useEffect, useRef, useState } from 'react'

import { consumeNdjsonStream, fetchTaskStream, getTask } from '@/api/tasks'
import type { TaskDetail, TaskStreamEvent } from '@/types/task'

export function useTaskStream(taskId: number | null, maxReconnects = 3) {
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [references, setReferences] = useState<Record<string, unknown>[]>([])
  const controller = useRef<AbortController | null>(null)
  const seen = useRef(new Set<string>())
  const done = useRef(false)

  const apply = useCallback((event: TaskStreamEvent) => {
    if (event.event_id && seen.current.has(event.event_id)) return
    if (event.event_id) seen.current.add(event.event_id)
    if (event.type === 'warning' && event.message) setWarnings((items) => [...items, event.message as string])
    if (event.type === 'reference' && event.reference) setReferences((items) => [...items, event.reference as Record<string, unknown>])
    setTask((current) => {
      if (!current || (event.type === 'done' && done.current)) return current
      if (event.type === 'done') done.current = true
      return {
        ...current,
        current_stage: event.stage ?? current.current_stage,
        status_message: event.message ?? current.status_message,
        progress: event.progress ?? current.progress,
        partial_content: event.type === 'meta' && event.snapshot ? event.text || '' : event.type === 'delta' ? `${current.partial_content || ''}${event.text || ''}` : current.partial_content,
        result_payload: event.result_payload || current.result_payload,
        status: event.type === 'done' ? 'success' : event.type === 'error' ? 'failed' : event.status || current.status,
        error_message: event.type === 'error' ? event.error || event.message : current.error_message
      }
    })
  }, [])

  useEffect(() => {
    controller.current?.abort()
    setTask(null)
    setError(null)
    setWarnings([])
    setReferences([])
    seen.current = new Set<string>()
    done.current = false

    if (!taskId) return
    let active = true
    let terminal = false
    let snapshotRequestRunning = false
    let snapshotTimer: number | undefined

    const refreshSnapshot = async () => {
      if (!active || terminal || snapshotRequestRunning) return
      snapshotRequestRunning = true
      try {
        const snapshot = await getTask(taskId)
        if (!active) return
        if (snapshot.status === 'success' || snapshot.status === 'failed') {
          terminal = true
          done.current = snapshot.status === 'success'
          setTask(snapshot)
          controller.current?.abort()
          if (snapshotTimer) window.clearInterval(snapshotTimer)
        }
      } catch {
        // The authenticated stream remains primary; a later snapshot tick can recover.
      } finally {
        snapshotRequestRunning = false
      }
    }

    snapshotTimer = window.setInterval(() => void refreshSnapshot(), 2500)
    const connect = async (attempt: number): Promise<void> => {
      try {
        const snapshot = await getTask(taskId)
        if (!active) return
        setTask(snapshot)
        if (snapshot.status === 'success' || snapshot.status === 'failed') {
          terminal = true
          done.current = snapshot.status === 'success'
          return
        }
        controller.current = new AbortController()
        await consumeNdjsonStream(await fetchTaskStream(taskId, controller.current.signal), apply)
        if (!done.current) throw new Error('任务流意外断开')
      } catch (cause) {
        if (!active || terminal || controller.current?.signal.aborted) return
        if (attempt < maxReconnects) return connect(attempt + 1)
        setError(cause instanceof Error ? cause.message : '任务流连接失败，已退回轮询')
        const poll = async () => {
          const snapshot = await getTask(taskId)
          if (!active) return
          setTask(snapshot)
          if (snapshot.status !== 'success' && snapshot.status !== 'failed') window.setTimeout(poll, 2500)
        }
        await poll()
      }
    }
    void connect(0)
    return () => {
      active = false
      if (snapshotTimer) window.clearInterval(snapshotTimer)
      controller.current?.abort()
    }
  }, [apply, maxReconnects, taskId])
  return { task, error, warnings, references }
}
