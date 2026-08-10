import React from 'react'

import SafeMarkdown from './SafeMarkdown'
import { GenerationProgress, type GenerationProgressVariant } from './GenerationProgress'
import { useTaskStream } from './useTaskStream'

interface TaskStreamPanelProps {
  taskId: number
  dataTestId?: string
  title?: string
  variant?: GenerationProgressVariant
  compact?: boolean
  onCompleted?: (resultPayload: Record<string, unknown>, references: Record<string, unknown>[]) => void
  onFailed?: (message: string) => void
}

export function TaskStreamPanel({
  taskId,
  dataTestId = 'teacher-task-progress',
  title = 'AI 生成任务',
  variant = 'teacher',
  compact = false,
  onCompleted,
  onFailed
}: TaskStreamPanelProps) {
  const { task, error, warnings, references } = useTaskStream(taskId)
  const completionHandled = React.useRef(false)

  React.useEffect(() => {
    completionHandled.current = false
  }, [taskId])

  React.useEffect(() => {
    if (!task || completionHandled.current) return
    if (task.status === 'success') {
      completionHandled.current = true
      onCompleted?.(task.result_payload || {}, references)
    } else if (task.status === 'failed') {
      completionHandled.current = true
      onFailed?.(task.error_message || error || '生成任务失败')
    }
  }, [error, onCompleted, onFailed, references, task])

  if (!task) {
    return (
      <GenerationProgress
        visible
        title={title}
        subtitle="连接任务"
        statusText="正在连接生成任务..."
        percent={6}
        state="running"
        variant={compact ? 'compact' : variant}
        dataTestId={dataTestId}
      />
    )
  }

  const artifactId = Number(task.result_payload?.artifact_id || task.result_artifact_id || 0)
  const state = task.status === 'success' ? 'success' : task.status === 'failed' ? 'error' : 'running'
  const statusText = task.status === 'success'
    ? '生成完成，结果已就绪。'
    : task.status === 'failed'
      ? '生成未完成，请检查输入后重试。'
      : error
        ? '实时连接已切换为后台同步，生成仍在继续。'
        : task.status_message || stageStatus(task.current_stage)

  return (
    <GenerationProgress
      visible
      title={title}
      subtitle={stageLabel(task.current_stage)}
      statusText={statusText}
      percent={task.status === 'success' ? 100 : task.progress}
      state={state}
      variant={compact ? 'compact' : variant}
      className="task-stream-panel"
      dataTestId={dataTestId}
    >
      {references.length > 0 && <p>已解析参考资料：{references.map((item) => String(item.source_filename || item.file_id || item.document_id || '资料')).join('、')}</p>}
      {task.partial_content && <SafeMarkdown content={task.partial_content} className="task-partial-content" />}
      {warnings.map((warning, index) => <p className="task-warning" key={`${warning}-${index}`}>{warning}</p>)}
      {task.status === 'failed' && <p className="task-error">当前内容生成未完成，请稍后重试。</p>}
      {task.status === 'success' && artifactId > 0 && <a href={`/teacher/generated-artifacts/${artifactId}`}>查看生成资源详情</a>}
    </GenerationProgress>
  )
}

function stageLabel(stage?: string | null) {
  const labels: Record<string, string> = {
    queued: '等待生成',
    preparing: '准备资料',
    extracting: '分析内容',
    generating: '生成结果',
    validating: '校验输出',
    finalizing: '整理内容',
    completed: '生成完成'
  }
  return labels[String(stage || '').toLowerCase()] || '生成处理中'
}

function stageStatus(stage?: string | null) {
  const labels: Record<string, string> = {
    queued: '任务已提交，正在等待处理。',
    preparing: '正在准备生成所需的资料。',
    extracting: '正在分析输入内容。',
    generating: '正在组织结构并生成结果。',
    validating: '正在校验生成内容。',
    finalizing: '正在整理最终内容。'
  }
  return labels[String(stage || '').toLowerCase()] || '正在生成内容...'
}
