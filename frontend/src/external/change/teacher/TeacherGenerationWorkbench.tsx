import { useEffect, useMemo, useState } from 'react'

import { getFile, uploadFilesBatch, type FileAsset } from '@/api/files'
import { getKnowledgeDocuments, type KnowledgeDocument } from '@/api/knowledge'
import { getTask } from '@/api/tasks'
import {
  generateExercises,
  generateExercisesAsync,
  generatePaper,
  generatePaperAsync,
  generateTrainingPlan,
  generateTrainingPlanAsync,
  getGeneratedArtifacts,
  type ArtifactType,
  type GeneratedArtifactListItem,
  type TeacherGenerationPayload,
  type TeacherGenerationResponse
} from '@/api/teacher'
import type { TaskCreateResponse, TaskDetail } from '@/types/task'
import SafeMarkdown from '@/external/shared/SafeMarkdown'

import './teacher-pages.css'

export type TeacherExternalGenerationPage = 'training-program' | 'exercises' | 'papers'

type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'multiline'
type FieldValue = string | number

interface FieldOption {
  label: string
  value: string
}

interface FieldDefinition {
  key: string
  label: string
  kind: FieldKind
  required?: boolean
  rows?: number
  min?: number
  max?: number
  hint?: string
  wide?: boolean
  defaultValue?: FieldValue
  options?: FieldOption[]
  quickOptions?: string[]
}

interface WorkbenchConfig {
  page: TeacherExternalGenerationPage
  testId: string
  artifactType: ArtifactType
  title: string
  subtitle: string
  description: string
  formTitle: string
  formDescription: string
  previewTitle: string
  previewDescription: string
  submitLabel: string
  asyncLabel: string
  submit: (payload: TeacherGenerationPayload) => Promise<TeacherGenerationResponse>
  submitAsync: (payload: TeacherGenerationPayload) => Promise<TaskCreateResponse>
  fields: FieldDefinition[]
}

const pageConfigs: Record<TeacherExternalGenerationPage, WorkbenchConfig> = {
  'training-program': {
    page: 'training-program',
    testId: 'external-teacher-training-program',
    artifactType: 'training_plan',
    title: '智能培养方案生成',
    subtitle: 'AI-DRIVEN TRAINING PROGRAM GENERATION',
    description: '围绕培养目标、毕业要求、核心课程和产业需求生成结构化培养方案，支持参考文件和知识库增强。',
    formTitle: '培养方案工作台',
    formDescription: '填写专业、层次、培养目标与核心课程',
    previewTitle: '能力结构与方案预览',
    previewDescription: '实时汇总核心课程、培养重点和生成结果',
    submitLabel: '生成培养方案',
    asyncLabel: '提交异步方案任务',
    submit: generateTrainingPlan,
    submitAsync: generateTrainingPlanAsync,
    fields: [
      { key: 'program_name', label: '方案名称', kind: 'text', required: true, wide: true, defaultValue: '人工智能人才培养方案' },
      { key: 'education_level', label: '培养层次', kind: 'text', required: true, defaultValue: '本科' },
      { key: 'major_name', label: '专业名称', kind: 'text', required: true, defaultValue: '计算机科学与技术' },
      { key: 'training_objectives', label: '培养目标', kind: 'textarea', required: true, rows: 4 },
      { key: 'graduation_requirements', label: '毕业要求', kind: 'textarea', rows: 3 },
      { key: 'core_courses', label: '核心课程', kind: 'multiline', rows: 4, hint: '每行一门课程' },
      { key: 'industry_requirements', label: '行业需求', kind: 'textarea', rows: 3 },
      { key: 'additional_requirements', label: '补充要求', kind: 'textarea', rows: 3 }
    ]
  },
  exercises: {
    page: 'exercises',
    testId: 'external-teacher-exercises',
    artifactType: 'exercise',
    title: '习题智能生成',
    subtitle: 'AI-DRIVEN EXERCISE GENERATION',
    description: '围绕知识点、题型、数量和难度生成结构化练习题，并保留质量分析、引用和历史追踪。',
    formTitle: '习题生成配置',
    formDescription: '选择题型、难度、题量与参考内容',
    previewTitle: '题型与参数预览',
    previewDescription: '检查题量、题型分布和参考材料状态',
    submitLabel: '生成习题',
    asyncLabel: '提交异步习题任务',
    submit: generateExercises,
    submitAsync: generateExercisesAsync,
    fields: [
      { key: 'course_name', label: '课程名称', kind: 'text', required: true, wide: true, defaultValue: 'Python 程序设计' },
      {
        key: 'knowledge_points',
        label: '知识点',
        kind: 'multiline',
        required: true,
        rows: 4,
        hint: '每行一个知识点',
        quickOptions: ['变量与数据类型', '条件分支', '循环结构', '函数封装']
      },
      {
        key: 'difficulty',
        label: '难度',
        kind: 'select',
        required: true,
        defaultValue: 'normal',
        options: [
          { label: '基础', value: 'easy' },
          { label: '常规', value: 'normal' },
          { label: '提高', value: 'hard' }
        ]
      },
      {
        key: 'question_types',
        label: '题型',
        kind: 'multiline',
        required: true,
        rows: 3,
        hint: '每行一种题型',
        defaultValue: '选择题\n填空题\n简答题',
        quickOptions: ['选择题', '判断题', '填空题', '简答题', '应用题']
      },
      { key: 'question_count', label: '题目数量', kind: 'number', required: true, min: 1, max: 100, defaultValue: 10 },
      { key: 'reference_text', label: '参考文本', kind: 'textarea', rows: 4 },
      { key: 'additional_requirements', label: '补充要求', kind: 'textarea', rows: 3 }
    ]
  },
  papers: {
    page: 'papers',
    testId: 'external-teacher-papers',
    artifactType: 'paper',
    title: '智能试卷生成',
    subtitle: 'AI-DRIVEN EXAM PAPER GENERATION',
    description: '根据考试范围、题型分布、总分和时长生成完整试卷，覆盖标准答案、解析与评分建议。',
    formTitle: '试卷配置',
    formDescription: '设置范围、题型、分值、难度与考试时长',
    previewTitle: '试卷参数预览',
    previewDescription: '实时检查题型分布、总分和生成状态',
    submitLabel: '生成试卷',
    asyncLabel: '提交异步试卷任务',
    submit: generatePaper,
    submitAsync: generatePaperAsync,
    fields: [
      { key: 'course_name', label: '课程名称', kind: 'text', required: true, wide: true, defaultValue: '计算机组成原理' },
      { key: 'exam_scope', label: '考试范围', kind: 'textarea', required: true, rows: 4 },
      { key: 'total_score', label: '总分', kind: 'number', required: true, min: 1, max: 300, defaultValue: 100 },
      { key: 'duration_minutes', label: '考试时长（分钟）', kind: 'number', required: true, min: 10, max: 300, defaultValue: 120 },
      { key: 'question_distribution', label: '题型与分值分布', kind: 'textarea', required: true, rows: 4 },
      { key: 'difficulty_ratio', label: '难度比例', kind: 'text', required: true, defaultValue: '基础30%，中等50%，提高20%' },
      { key: 'additional_requirements', label: '补充要求', kind: 'textarea', rows: 3 }
    ]
  }
}

function createInitialValues(config: WorkbenchConfig): Record<string, FieldValue> {
  return config.fields.reduce<Record<string, FieldValue>>((values, field) => {
    if (field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue
    } else if (field.kind === 'number') {
      values[field.key] = ''
    } else {
      values[field.key] = ''
    }
    return values
  }, {})
}

function splitLines(value: FieldValue | undefined) {
  return String(value ?? '')
    .split(/\n|,|，|；|;/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatArtifactType(type: string) {
  const labels: Record<string, string> = {
    training_plan: '培养方案',
    course_design: '课程设计',
    exercise: '习题',
    paper: '试卷'
  }
  return labels[type] || type
}

function createSkillSummary(config: WorkbenchConfig, values: Record<string, FieldValue>) {
  if (config.page === 'training-program') return splitLines(values.core_courses).slice(0, 8)
  if (config.page === 'exercises') return splitLines(values.knowledge_points).slice(0, 8)
  return splitLines(values.exam_scope).slice(0, 8)
}

export default function TeacherGenerationWorkbench({ page }: { page: TeacherExternalGenerationPage }) {
  const config = pageConfigs[page]
  const [values, setValues] = useState<Record<string, FieldValue>>(() => createInitialValues(config))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [statusMessage, setStatusMessage] = useState('就绪')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAsyncGenerating, setIsAsyncGenerating] = useState(false)
  const [result, setResult] = useState<TeacherGenerationResponse | null>(null)
  const [history, setHistory] = useState<GeneratedArtifactListItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<FileAsset[]>([])
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<number[]>([])
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(false)
  const [retrievalQuery, setRetrievalQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [uploading, setUploading] = useState(false)
  const [asyncTaskId, setAsyncTaskId] = useState<number | null>(null)
  const [asyncTask, setAsyncTask] = useState<TaskDetail | null>(null)

  const summaryItems = useMemo(() => createSkillSummary(config, values), [config, values])

  useEffect(() => {
    setValues(createInitialValues(config))
    setErrors({})
    setResult(null)
    setAsyncTaskId(null)
    setAsyncTask(null)
    setStatusMessage('就绪')
  }, [config])

  useEffect(() => {
    void loadHistory()
    void loadKnowledgeDocuments()
  }, [config.artifactType])

  useEffect(() => {
    if (!asyncTaskId) return undefined
    const taskId = asyncTaskId
    let stopped = false
    let timer: ReturnType<typeof window.setTimeout> | undefined

    async function pollTask() {
      try {
        const task = await getTask(taskId)
        if (stopped) return
        setAsyncTask(task)
        if (task.status === 'success') {
          setStatusMessage('异步任务已完成，可在生成历史中查看结果')
          await loadHistory()
          return
        }
        if (task.status === 'failed') {
          setStatusMessage(task.error_message || '异步任务失败，请查看任务中心')
          return
        }
        timer = window.setTimeout(pollTask, 2500)
      } catch (error) {
        if (!stopped) setStatusMessage(error instanceof Error ? error.message : '任务状态查询失败')
      }
    }

    void pollTask()

    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [asyncTaskId])

  function setField(key: string, value: FieldValue) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function toggleQuickOption(field: FieldDefinition, option: string) {
    const current = splitLines(values[field.key])
    const next = current.includes(option) ? current.filter((item) => item !== option) : [...current, option]
    setField(field.key, next.join('\n'))
  }

  function validateForm() {
    const nextErrors: Record<string, string> = {}
    config.fields.forEach((field) => {
      const value = values[field.key]
      if (field.required) {
        const hasValue = field.kind === 'multiline' ? splitLines(value).length > 0 : String(value ?? '').trim().length > 0
        if (!hasValue) nextErrors[field.key] = `请填写${field.label}`
      }
      if (field.kind === 'number' && String(value ?? '').trim()) {
        const numberValue = Number(value)
        if (!Number.isFinite(numberValue)) nextErrors[field.key] = `${field.label}必须是数字`
        if (field.min !== undefined && numberValue < field.min) nextErrors[field.key] = `${field.label}不能小于 ${field.min}`
        if (field.max !== undefined && numberValue > field.max) nextErrors[field.key] = `${field.label}不能大于 ${field.max}`
      }
    })
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function buildPayload(): TeacherGenerationPayload {
    const payload: TeacherGenerationPayload = {}
    config.fields.forEach((field) => {
      const value = values[field.key]
      if (field.kind === 'multiline') {
        const list = splitLines(value)
        if (list.length) payload[field.key] = list
        return
      }
      if (field.kind === 'number') {
        if (String(value ?? '').trim()) payload[field.key] = Number(value)
        return
      }
      if (String(value ?? '').trim()) payload[field.key] = String(value).trim()
    })

    const fileIds = uploadedFiles.map((file) => file.id)
    if (fileIds.length) payload.file_ids = fileIds
    if (selectedKnowledgeIds.length) payload.knowledge_document_ids = selectedKnowledgeIds
    payload.use_knowledge_base = useKnowledgeBase
    payload.top_k = topK
    if (retrievalQuery.trim()) payload.retrieval_query = retrievalQuery.trim()
    return payload
  }

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const response = await getGeneratedArtifacts({ artifact_type: config.artifactType, page: 1, page_size: 5 })
      setHistory(Array.isArray(response) ? response : response.items || response.artifacts || [])
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadKnowledgeDocuments() {
    setKnowledgeLoading(true)
    try {
      const response = await getKnowledgeDocuments({ page: 1, page_size: 50 })
      setKnowledgeDocs(response.items)
    } finally {
      setKnowledgeLoading(false)
    }
  }

  async function submitGeneration(event: React.FormEvent) {
    event.preventDefault()
    if (!validateForm()) {
      setStatusMessage('请先补充必填信息')
      return
    }

    setIsGenerating(true)
    setResult(null)
    setStatusMessage('正在生成内容...')
    try {
      const response = await config.submit(buildPayload())
      setResult(response)
      setStatusMessage('生成完成，结果已写入生成历史')
      await loadHistory()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '生成失败，请稍后重试')
    } finally {
      setIsGenerating(false)
    }
  }

  async function submitAsyncGeneration() {
    if (!validateForm()) {
      setStatusMessage('请先补充必填信息')
      return
    }

    setIsAsyncGenerating(true)
    setStatusMessage('正在提交异步任务...')
    try {
      const task = await config.submitAsync(buildPayload())
      setAsyncTaskId(task.task_id)
      setAsyncTask(null)
      setStatusMessage(`异步任务 #${task.task_id} 已提交`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '异步任务提交失败')
    } finally {
      setIsAsyncGenerating(false)
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    if (!files.length) return

    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    formData.append('purpose', 'teacher_generation_reference')
    setUploading(true)
    setStatusMessage('正在上传参考文件...')
    try {
      const result = await uploadFilesBatch(formData)
      const uploaded = await Promise.all(result.items.filter((item) => item.success && item.file_id).map((item) => getFile(Number(item.file_id))))
      setUploadedFiles((current) => [...uploaded, ...current.filter((item) => !uploaded.some((next) => next.id === item.id))].slice(0, 20))
      setStatusMessage(`上传完成：成功 ${result.succeeded}，失败 ${result.failed}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '参考文件上传失败')
    } finally {
      setUploading(false)
    }
  }

  function toggleKnowledgeDocument(documentId: number) {
    setSelectedKnowledgeIds((current) =>
      current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId]
    )
  }

  return (
    <main className={`teacher-workbench-page teacher-workbench-page--${config.page}`} data-testid={config.testId}>
      <div className="teacher-prism-background" aria-hidden="true" />
      <div className="workbench-shell">
        <header className="workbench-hero">
          <div>
            <span className="workbench-kicker">棱镜智教-PrismMind</span>
            <h1>{config.title}</h1>
            <span className="workbench-subtitle">{config.subtitle}</span>
            <p>{config.description}</p>
          </div>
          <nav className="workbench-links" aria-label="教师生成页面快捷入口">
            <a href="/teacher/artifacts">生成历史</a>
            <a href="/tasks">任务中心</a>
            <a href="/teacher/knowledge">知识库</a>
          </nav>
        </header>

        <section className="workbench-layout">
          <section className="workbench-panel workbench-panel--form">
            <div className="panel-heading">
              <div className="panel-title-wrap">
                <span className="panel-icon" aria-hidden="true">
                  <Icon name="spark" />
                </span>
                <div>
                  <h2>{config.formTitle}</h2>
                  <p>{config.formDescription}</p>
                </div>
              </div>
              <span className="status-pill">{isGenerating ? '生成中' : '就绪'}</span>
            </div>

            <form className="workbench-form" onSubmit={submitGeneration}>
              <div className="field-grid">
                {config.fields.map((field) => (
                  <FieldControl
                    field={field}
                    key={field.key}
                    value={values[field.key]}
                    error={errors[field.key]}
                    onChange={(value) => setField(field.key, value)}
                    onToggleOption={(option) => toggleQuickOption(field, option)}
                  />
                ))}
              </div>

              <ReferencePanel
                knowledgeDocs={knowledgeDocs}
                knowledgeLoading={knowledgeLoading}
                selectedKnowledgeIds={selectedKnowledgeIds}
                uploadedFiles={uploadedFiles}
                uploading={uploading}
                useKnowledgeBase={useKnowledgeBase}
                retrievalQuery={retrievalQuery}
                topK={topK}
                onUpload={handleUpload}
                onRefreshKnowledge={loadKnowledgeDocuments}
                onToggleKnowledge={toggleKnowledgeDocument}
                onUseKnowledgeBaseChange={setUseKnowledgeBase}
                onRetrievalQueryChange={setRetrievalQuery}
                onTopKChange={setTopK}
                onRemoveFile={(fileId) => setUploadedFiles((current) => current.filter((file) => file.id !== fileId))}
              />

              <div className="action-row">
                <button className="primary-action" disabled={isGenerating} type="submit">
                  {isGenerating ? '生成中...' : config.submitLabel}
                </button>
                <button className="secondary-action" disabled={isAsyncGenerating || isGenerating} type="button" onClick={submitAsyncGeneration}>
                  {isAsyncGenerating ? '提交中...' : config.asyncLabel}
                </button>
                <span className="inline-status" aria-live="polite">
                  {statusMessage}
                </span>
              </div>
            </form>
          </section>

          <aside className="workbench-stack">
            <section className="workbench-panel workbench-panel--preview">
              <div className="panel-heading">
                <div className="panel-title-wrap">
                  <span className="panel-icon" aria-hidden="true">
                    <Icon name="target" />
                  </span>
                  <div>
                    <h3>{config.previewTitle}</h3>
                    <p>{config.previewDescription}</p>
                  </div>
                </div>
              </div>
              <ParameterPreview config={config} values={values} summaryItems={summaryItems} />
            </section>

            {asyncTaskId ? (
              <section className="workbench-panel workbench-panel--preview">
                <div className="panel-heading">
                  <div className="panel-title-wrap">
                    <span className="panel-icon" aria-hidden="true">
                      <Icon name="clock" />
                    </span>
                    <div>
                      <h3>异步任务</h3>
                      <p>任务 #{asyncTaskId} 正在由 Celery Worker 处理</p>
                    </div>
                  </div>
                  <a className="panel-action" href="/tasks">打开任务中心</a>
                </div>
                <div className="task-progress" data-testid="external-teacher-async-task">
                  <div>
                    <span>状态</span>
                    <strong>{asyncTask?.status || 'pending'}</strong>
                  </div>
                  <div>
                    <span>进度</span>
                    <strong>{asyncTask?.progress ?? 0}%</strong>
                  </div>
                  {asyncTask?.error_message ? <p>{asyncTask.error_message}</p> : null}
                </div>
              </section>
            ) : null}

            <section className="workbench-panel workbench-panel--preview workbench-panel--result">
              <div className="panel-heading">
                <div className="panel-title-wrap">
                  <span className="panel-icon" aria-hidden="true">
                    <Icon name="document" />
                  </span>
                  <div>
                    <h3>生成结果</h3>
                    <p>同步生成后展示 Markdown、引用、警告和质量分析</p>
                  </div>
                </div>
                {result ? <a className="panel-action" href={`/teacher/artifacts/${result.artifact_id}`}>查看详情</a> : null}
              </div>
              <GenerationResult result={result} />
            </section>

            <section className="workbench-panel workbench-panel--preview">
              <div className="panel-heading">
                <div className="panel-title-wrap">
                  <span className="panel-icon" aria-hidden="true">
                    <Icon name="history" />
                  </span>
                  <div>
                    <h3>最近生成历史</h3>
                    <p>{formatArtifactType(config.artifactType)}最近 5 条真实记录</p>
                  </div>
                </div>
                <button className="panel-action" disabled={historyLoading} type="button" onClick={loadHistory}>
                  刷新
                </button>
              </div>
              <HistoryList history={history} loading={historyLoading} />
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}

function FieldControl({
  field,
  value,
  error,
  onChange,
  onToggleOption
}: {
  field: FieldDefinition
  value: FieldValue
  error?: string
  onChange: (value: FieldValue) => void
  onToggleOption: (option: string) => void
}) {
  const id = `teacher-${field.key}`
  const quickValues = splitLines(value)

  return (
    <label className={`form-field${field.wide || field.kind === 'textarea' || field.kind === 'multiline' ? ' form-field--wide' : ''}`} htmlFor={id}>
      <span className="field-label">
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      {field.quickOptions?.length ? (
        <div className="chip-row" aria-label={`${field.label}快捷选项`}>
          {field.quickOptions.map((option) => (
            <button
              className={`type-chip${quickValues.includes(option) ? ' is-active' : ''}`}
              key={option}
              type="button"
              onClick={() => onToggleOption(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
      <div className="field-control">
        {field.kind === 'textarea' || field.kind === 'multiline' ? (
          <textarea
            id={id}
            rows={field.rows || 3}
            value={value}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        ) : field.kind === 'select' ? (
          <select id={id} value={value} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.currentTarget.value)}>
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            min={field.min}
            max={field.max}
            type={field.kind === 'number' ? 'number' : 'text'}
            value={value}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(field.kind === 'number' ? event.currentTarget.value : event.currentTarget.value)}
          />
        )}
      </div>
      {field.hint ? <span className="field-hint">{field.hint}</span> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </label>
  )
}

function ReferencePanel({
  knowledgeDocs,
  knowledgeLoading,
  selectedKnowledgeIds,
  uploadedFiles,
  uploading,
  useKnowledgeBase,
  retrievalQuery,
  topK,
  onUpload,
  onRefreshKnowledge,
  onToggleKnowledge,
  onUseKnowledgeBaseChange,
  onRetrievalQueryChange,
  onTopKChange,
  onRemoveFile
}: {
  knowledgeDocs: KnowledgeDocument[]
  knowledgeLoading: boolean
  selectedKnowledgeIds: number[]
  uploadedFiles: FileAsset[]
  uploading: boolean
  useKnowledgeBase: boolean
  retrievalQuery: string
  topK: number
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRefreshKnowledge: () => Promise<void>
  onToggleKnowledge: (documentId: number) => void
  onUseKnowledgeBaseChange: (value: boolean) => void
  onRetrievalQueryChange: (value: string) => void
  onTopKChange: (value: number) => void
  onRemoveFile: (fileId: number) => void
}) {
  return (
    <section className="reference-panel" aria-label="参考文件和知识库">
      <div className="reference-panel__header">
        <div>
          <strong>参考增强</strong>
          <span>上传参考文件，或选择已入库知识文档参与生成</span>
        </div>
        <button className="secondary-action" disabled={knowledgeLoading} type="button" onClick={() => void onRefreshKnowledge()}>
          {knowledgeLoading ? '刷新中...' : '刷新知识库'}
        </button>
      </div>

      <div className="reference-grid">
        <div className="upload-card">
          <input
            aria-label="上传参考文件"
            disabled={uploading}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md"
            onChange={onUpload}
          />
          <span className="field-hint">支持 PDF / DOCX / TXT / MD，文件将作为本次生成的参考材料。</span>
          <div className="file-chip-list">
            {uploadedFiles.map((file) => (
              <span className="file-chip" key={file.id}>
                {file.original_filename}
                <button type="button" onClick={() => onRemoveFile(file.id)}>
                  移除
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="knowledge-picker">
          <label className="switch-row">
            <input checked={useKnowledgeBase} type="checkbox" onChange={(event) => onUseKnowledgeBaseChange(event.currentTarget.checked)} />
            <span>启用知识库检索</span>
          </label>
          <label className="form-field form-field--wide">
            <span className="field-label">检索问题</span>
            <div className="field-control">
              <textarea rows={2} value={retrievalQuery} onChange={(event) => onRetrievalQueryChange(event.currentTarget.value)} />
            </div>
          </label>
          <label className="form-field">
            <span className="field-label">引用数量</span>
            <div className="field-control">
              <input min={1} max={10} type="number" value={topK} onChange={(event) => onTopKChange(Number(event.currentTarget.value) || 5)} />
            </div>
          </label>
          <div className="knowledge-chip-list">
            {knowledgeDocs.length ? (
              knowledgeDocs.slice(0, 10).map((document) => (
                <button
                  className={`knowledge-chip${selectedKnowledgeIds.includes(document.id) ? ' is-active' : ''}`}
                  key={document.id}
                  type="button"
                  onClick={() => onToggleKnowledge(document.id)}
                >
                  <span>{document.title}</span>
                  <small>{document.status}</small>
                </button>
              ))
            ) : (
              <p className="reference-empty">暂无可选知识库文档，可先到知识库页面创建并入库。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function ParameterPreview({
  config,
  values,
  summaryItems
}: {
  config: WorkbenchConfig
  values: Record<string, FieldValue>
  summaryItems: string[]
}) {
  const requiredFields = config.fields.filter((field) => field.required)
  const completed = requiredFields.filter((field) => {
    const value = values[field.key]
    return field.kind === 'multiline' ? splitLines(value).length > 0 : String(value ?? '').trim().length > 0
  }).length
  const completion = requiredFields.length ? Math.round((completed / requiredFields.length) * 100) : 100

  return (
    <div className="parameter-preview" data-testid="external-teacher-parameter-preview">
      <div className="overview-grid">
        <div className="overview-item">
          <span>必填完成度</span>
          <strong>{completion}%</strong>
        </div>
        <div className="overview-item">
          <span>生成类型</span>
          <strong>{formatArtifactType(config.artifactType)}</strong>
        </div>
        <div className="overview-item">
          <span>生成方式</span>
          <strong>智能生成</strong>
        </div>
      </div>
      {summaryItems.length ? (
        <ul className="skill-list">
          {summaryItems.map((item, index) => (
            <li className="training-skill-item" key={`${item}-${index}`}>
              <span className="training-skill-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="training-skill-main">
                <strong>{item}</strong>
                <span className="training-skill-bar">
                  <span style={{ width: `${Math.max(42, 94 - index * 7)}%` }} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="preview-empty">
          <strong>等待关键参数</strong>
          <span>补充表单后，这里会展示结构化生成线索。</span>
        </div>
      )}
    </div>
  )
}

function GenerationResult({ result }: { result: TeacherGenerationResponse | null }) {
  if (!result) {
    return (
      <div className="preview-empty">
        <strong>生成结果将在这里显示</strong>
        <span>提交同步生成后，会展示 Markdown 内容、引用、警告和质量分析。</span>
      </div>
    )
  }

  return (
    <div className="generation-result" data-testid="external-teacher-generation-result">
      <div className="result-meta">
        <span>{formatArtifactType(result.artifact_type)}</span>
        <strong>{result.title}</strong>
        <small>{formatDate(result.created_at)}</small>
      </div>
      <QualityPanel analysis={result.quality_analysis} />
      <MarkdownBlock content={result.content} />
      <ReferenceList references={result.references || []} warnings={result.warnings || []} />
    </div>
  )
}

function QualityPanel({ analysis }: { analysis?: TeacherGenerationResponse['quality_analysis'] | null }) {
  if (!analysis) {
    return (
      <div className="quality-panel" data-testid="external-teacher-quality">
        <strong>质量分析</strong>
        <span>后端未返回质量分析。</span>
      </div>
    )
  }

  const coverage = Number(analysis.coverage?.coverage_rate || 0)
  const coveragePercent = Math.round(coverage <= 1 ? coverage * 100 : coverage)

  return (
    <div className="quality-panel" data-testid="external-teacher-quality">
      <div>
        <span>覆盖度</span>
        <strong>{coveragePercent}%</strong>
      </div>
      <div>
        <span>深度</span>
        <strong>{analysis.depth?.score ?? '-'}</strong>
      </div>
      <div>
        <span>置信度</span>
        <strong>{analysis.confidence?.level || '-'}</strong>
      </div>
      {analysis.suggestions?.length ? <p>{analysis.suggestions.slice(0, 2).join('；')}</p> : null}
    </div>
  )
}

function MarkdownBlock({ content }: { content: string }) {
  return <SafeMarkdown content={content} className="teacher-markdown" />
}

function ReferenceList({
  references,
  warnings
}: {
  references: NonNullable<TeacherGenerationResponse['references']>
  warnings: NonNullable<TeacherGenerationResponse['warnings']>
}) {
  return (
    <div className="reference-result-list">
      {references.length ? (
        <div>
          <strong>知识引用</strong>
          {references.slice(0, 6).map((reference, index) => (
            <article key={`${reference.source_type}-${reference.file_id || reference.document_id || index}`}>
              <span>{reference.source_filename || `Document ${reference.document_id || reference.file_id || index + 1}`}</span>
              <p>{reference.excerpt || reference.source_type}</p>
            </article>
          ))}
        </div>
      ) : null}
      {warnings.length ? (
        <div>
          <strong>生成提示</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function HistoryList({ history, loading }: { history: GeneratedArtifactListItem[]; loading: boolean }) {
  if (loading) {
    return <div className="preview-empty">正在读取生成历史...</div>
  }
  if (!history.length) {
    return (
      <div className="preview-empty">
        <strong>暂无生成历史</strong>
        <span>完成一次生成后会自动刷新。</span>
      </div>
    )
  }
  return (
    <div className="history-list" data-testid="external-teacher-history">
      {history.map((item) => (
        <a href={`/teacher/artifacts/${item.id || item.artifact_id}`} key={`${item.id || item.artifact_id}-${item.created_at}`}>
          <span>{formatArtifactType(item.artifact_type)}</span>
          <strong>{item.title}</strong>
          <small>{formatDate(item.created_at)}</small>
        </a>
      ))}
    </div>
  )
}

function Icon({ name }: { name: 'spark' | 'target' | 'clock' | 'document' | 'history' }) {
  const paths: Record<typeof name, string> = {
    spark: 'M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5z M18 15l.8 3.2L22 19l-3.2.8L18 23l-.8-3.2L14 19l3.2-.8z',
    target: 'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M7 7l2 2 M17 7l-2 2 M7 17l2-2 M17 17l-2-2 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    clock: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    document: 'M7 3h7l5 5v13H7z M14 3v6h6 M9 13h8 M9 17h6',
    history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l4 2'
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
