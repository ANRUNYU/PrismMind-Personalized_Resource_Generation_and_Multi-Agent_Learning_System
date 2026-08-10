import type { QualityAnalysis } from '@/types/qualityAnalysis'
import type { TaskCreateResponse } from '@/types/task'
import { getFile, uploadFilesBatch, type FileAsset } from '@/api/files'
import { resolveApiBaseURL } from '@/api/baseUrl'

const API_BASE_URL = resolveApiBaseURL()

export const EXAM_PAPER_GENERATION_ENDPOINTS = {
  generate: '/teacher/papers/generate',
  generateAsync: '/teacher/papers/generate-async',
  uploadReference: '/files/upload',
  myPapers: '/teacher/generated-artifacts?artifact_type=paper&page=1&page_size=10',
  artifactDetail: '/teacher/generated-artifacts'
} as const

export const DEFAULT_QUESTION_DISTRIBUTION = [
  '单项选择题：20题，每题2分',
  '填空题：10题，每题2分',
  '编程题：3题，每题10分',
  '简答题：2题，每题5分'
].join('\n')

export interface ExamPaperFormValues {
  courseId: number | null
  courseName: string
  examDuration: string
  examScope: string
  totalScore: string
  difficultyRatio: string
  questionDistribution: string
  referenceDescription: string
  referenceFile: File[]
  knowledgeDocumentIds: number[]
}

export interface ExamPaperValidation {
  errors: Partial<Record<keyof ExamPaperFormValues, string>>
  warnings: Partial<Record<keyof ExamPaperFormValues, string>>
  isValid: boolean
}

export interface QuestionRow {
  type: string
  count: number
  score: number
  total: number
}

export interface PaperQuestion {
  id: string
  stem: string
  options: string[]
  answer: string
  analysis: string
}

export interface PaperSection {
  title: string
  count: number
  total: number
  questions: PaperQuestion[]
}

export interface PaperReference {
  source_type: string
  file_id?: number | null
  document_id?: number | null
  chunk_index?: number | null
  source_filename?: string | null
  excerpt?: string | null
}

export interface ExamPaperGenerationResponse {
  success: true
  source: 'api'
  paperId: number
  artifact_id: number
  artifact_type: string
  title: string
  message: string
  content: string
  content_format: string
  created_at?: string
  quality_analysis?: QualityAnalysis | null
  references: PaperReference[]
  warnings: string[]
  data: {
    title: string
    totalScore: number
    durationMinutes: number
    difficultyRatio: string
    sections: PaperSection[]
    markdown: string
  }
}

export interface PaperHistoryItem {
  id: number
  title: string
  createdAt: string
  totalScore: number
  durationMinutes: number
  status: string
}

interface UploadedReference {
  fileId: number
  fileName: string
}

export interface ExamPreparationProgress {
  phase: 'uploading' | 'parsing' | 'submitting'
  message: string
  completed: number
  total: number
  percent: number
  files?: Array<{
    fileId: number
    fileName: string
    parseStatus: string
    error?: string | null
  }>
  warnings?: string[]
}

interface ApiResponsePayload<T> {
  code?: number
  message?: string
  data?: T
  detail?: unknown
}

interface GeneratedArtifactPayload {
  artifact_id?: number
  id?: number
  artifact_type?: string
  title?: string
  content?: string
  content_format?: string
  status?: string
  created_at?: string
  request_payload?: Record<string, unknown> | null
  quality_analysis?: QualityAnalysis | null
  references?: PaperReference[] | null
  warnings?: string[] | null
}

interface GeneratedArtifactListPayload {
  items?: GeneratedArtifactPayload[]
  artifacts?: GeneratedArtifactPayload[]
  total?: number
  page?: number
  page_size?: number
}

export function validateExamPaperForm(values: ExamPaperFormValues): ExamPaperValidation {
  const errors: ExamPaperValidation['errors'] = {}
  const warnings: ExamPaperValidation['warnings'] = {}
  const duration = parseDurationMinutes(values.examDuration)
  const totalScore = Number(values.totalScore)

  if (!values.courseName.trim()) {
    errors.courseName = '请填写课程名称后再生成试卷。'
  }

  if (!values.examScope.trim()) {
    errors.examScope = '请填写考试范围或核心知识点。'
  } else if (values.examScope.trim().length < 8) {
    warnings.examScope = '考试范围较短，建议补充章节、知识点或能力目标。'
  }

  if (!String(values.examDuration || '').trim() || duration <= 0) {
    errors.examDuration = '考试时长需要是有效分钟数。'
  } else if (duration > 300) {
    errors.examDuration = '考试时长不能超过 300 分钟。'
  }

  if (!String(values.totalScore || '').trim() || Number.isNaN(totalScore) || totalScore <= 0) {
    errors.totalScore = '试卷总分需要是有效正数。'
  } else if (totalScore > 300) {
    errors.totalScore = '试卷总分不能超过 300 分。'
  }

  if (!values.difficultyRatio.trim()) {
    errors.difficultyRatio = '请填写难度比例。'
  }

  if (!values.questionDistribution.trim()) {
    errors.questionDistribution = '请填写题型与分值分布。'
  }

  return {
    errors,
    warnings,
    isValid: Object.keys(errors).length === 0
  }
}

export function createExamPaperFormData(values: ExamPaperFormValues) {
  return {
    courseId: values.courseId,
    courseName: values.courseName.trim(),
    examDuration: values.examDuration.trim(),
    examScope: values.examScope.trim(),
    totalScore: values.totalScore.trim(),
    difficultyRatio: values.difficultyRatio.trim(),
    questionDistribution: values.questionDistribution.trim(),
    referenceDescription: values.referenceDescription.trim(),
    referenceFile: values.referenceFile,
    knowledgeDocumentIds: values.knowledgeDocumentIds
  }
}

export async function generateExamPaper(
  values: ExamPaperFormValues,
  onProgress?: (progress: ExamPreparationProgress) => void
): Promise<TaskCreateResponse> {
  const payload = await buildExamPaperGenerationPayload(values, onProgress)
  onProgress?.({
    phase: 'submitting',
    message: '参考资料已处理，正在提交试卷生成任务…',
    completed: 1,
    total: 1,
    percent: 100
  })
  return requestJson<TaskCreateResponse>(EXAM_PAPER_GENERATION_ENDPOINTS.generateAsync, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function fetchMyPapers(): Promise<{ source: 'api'; papers: PaperHistoryItem[] }> {
  const data = await requestJson<GeneratedArtifactListPayload | GeneratedArtifactPayload[]>(
    EXAM_PAPER_GENERATION_ENDPOINTS.myPapers
  )
  const items = Array.isArray(data) ? data : data.items || data.artifacts || []
  return {
    source: 'api',
    papers: normalizePaperList(items)
  }
}

export async function saveExamPaper(paper: ExamPaperGenerationResponse) {
  if (!paper.artifact_id) {
    throw new Error('当前生成结果尚未进入历史记录，暂时无法确认保存状态。')
  }

  return {
    source: 'api' as const,
    saved: true,
    paperId: paper.artifact_id,
    message: '试卷已自动保存到生成历史。'
  }
}

export async function uploadExamPaperReferenceFiles(
  files: File[],
  onProgress?: (progress: ExamPreparationProgress) => void
): Promise<{ references: UploadedReference[]; warnings: string[] }> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  formData.append('purpose', 'teacher_generation_reference')
  onProgress?.({ phase: 'uploading', message: `正在上传 ${files.length} 个参考文件…`, completed: 0, total: files.length, percent: 0 })
  const data = await uploadFilesBatch(formData, (event) => {
    const totalBytes = Number(event.total || 0)
    const loadedBytes = Number(event.loaded || 0)
    const percent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0
    onProgress?.({
      phase: 'uploading',
      message: totalBytes > 0 ? `正在上传参考文件（${percent}%）…` : `正在上传 ${files.length} 个参考文件…`,
      completed: loadedBytes,
      total: totalBytes,
      percent
    })
  })
  const successful = data.items.filter((item) => item.success && item.file_id)
  if (!successful.length) throw new Error(data.items[0]?.error_message || '参考文件上传失败')
  const warnings = data.items
    .filter((item) => !item.success)
    .map((item) => `文件“${item.original_name}”上传失败：${item.error_message || '未知错误'}`)
  return {
    references: successful.map((item) => ({ fileId: Number(item.file_id), fileName: item.original_name })),
    warnings
  }
}

export function formatDuration(value: string | number) {
  const minutes = parseDurationMinutes(String(value))
  return minutes > 0 ? `${minutes}分钟` : '0分钟'
}

export function parseQuestionRows(distribution: string): QuestionRow[] {
  return String(distribution || DEFAULT_QUESTION_DISTRIBUTION)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const type = normalizeQuestionTypeLabel(line, index)
      const numbers = line.match(/\d+/g)?.map(Number) || []
      const count = numbers[0] || 0
      const score = numbers[1] || 0
      return {
        type,
        count,
        score,
        total: count * score
      }
    })
}

async function buildExamPaperGenerationPayload(
  values: ExamPaperFormValues,
  onProgress?: (progress: ExamPreparationProgress) => void
) {
  const uploadResult = values.referenceFile.length
    ? await uploadExamPaperReferenceFiles(values.referenceFile, onProgress)
    : { references: [] as UploadedReference[], warnings: [] as string[] }
  const parsedReferences = uploadResult.references.length
    ? await waitForExamPaperReferences(uploadResult.references, uploadResult.warnings, onProgress)
    : []
  const additionalParts = [values.referenceDescription.trim()].filter(Boolean)

  if (parsedReferences.length) {
    additionalParts.push(`参考文件已解析：${parsedReferences.map((item) => item.fileName).join('、')}。`)
  }
  if (uploadResult.warnings.length) {
    additionalParts.push(`未使用的参考文件：${uploadResult.warnings.join('；')}。`)
  }

  const payload: Record<string, unknown> = {
    course_id: values.courseId,
    course_name: values.courseName.trim(),
    duration_minutes: parseDurationMinutes(values.examDuration),
    exam_scope: values.examScope.trim(),
    total_score: Number(values.totalScore),
    difficulty_ratio: values.difficultyRatio.trim(),
    question_distribution: values.questionDistribution.trim(),
    additional_requirements: additionalParts.length ? additionalParts.join('\n') : null,
    knowledge_document_ids: values.knowledgeDocumentIds.length ? values.knowledgeDocumentIds : null,
    use_knowledge_base: values.knowledgeDocumentIds.length > 0,
    top_k: 5
  }

  if (parsedReferences.length) {
    payload.file_ids = parsedReferences.map((item) => item.fileId)
  }

  return payload
}

function normalizeQuestionTypeLabel(line: string, index: number) {
  const aliases: Array<{ label: string; patterns: RegExp[] }> = [
    { label: '单项选择题', patterns: [/单项选择题/, /单选题/] },
    { label: '多项选择题', patterns: [/多项选择题/, /多选题/] },
    { label: '不定项选择题', patterns: [/不定项选择题/] },
    { label: '判断题', patterns: [/判断题/, /是非题/] },
    { label: '填空题', patterns: [/填空题/] },
    { label: '综合题', patterns: [/综合题/, /综合分析题/, /综合应用题/] },
    { label: '案例分析题', patterns: [/案例分析题/, /案例题/] },
    { label: '计算题', patterns: [/计算题/] },
    { label: '编程题', patterns: [/编程题/, /程序设计题/] },
    { label: '简答题', patterns: [/简答题/] },
    { label: '论述题', patterns: [/论述题/] },
    { label: '名词解释题', patterns: [/名词解释题/, /名词解释/] },
    { label: '选择题', patterns: [/选择题/] }
  ]
  const matched = aliases.find((item) => item.patterns.some((pattern) => pattern.test(line)))
  if (matched) return matched.label

  const enteredLabel = line
    .split(/[：:]/, 1)[0]
    .replace(/^\s*(?:[一二三四五六七八九十\d]+)[.、)）]\s*/, '')
    .trim()
  return enteredLabel || `题型${index + 1}`
}

async function waitForExamPaperReferences(
  references: UploadedReference[],
  warnings: string[],
  onProgress?: (progress: ExamPreparationProgress) => void
) {
  const deadline = Date.now() + 30 * 60 * 1000
  while (true) {
    const assets = await Promise.all(references.map((item) => getFile(item.fileId)))
    const terminalAssets = assets.filter((asset) => ['parsed', 'failed', 'deleted'].includes(asset.parse_status))
    const parsedAssets = assets.filter((asset) => asset.parse_status === 'parsed')
    const failedAssets = assets.filter((asset) => asset.parse_status === 'failed' || asset.parse_status === 'deleted')
    const waitingAssets = assets.filter((asset) => asset.parse_status === 'pending' || asset.parse_status === 'parsing')
    const progressFiles = assets.map(toProgressFile)
    const percent = assets.length ? Math.round((terminalAssets.length / assets.length) * 100) : 100

    failedAssets.forEach((asset) => {
      const warning = `文件“${asset.original_filename}”解析失败：${asset.parse_error || '文件不可用'}`
      if (!warnings.includes(warning)) warnings.push(warning)
    })

    onProgress?.({
      phase: 'parsing',
      message: waitingAssets.length
        ? `正在解析参考文件：已完成 ${terminalAssets.length}/${assets.length}，仍有 ${waitingAssets.length} 个处理中…`
        : failedAssets.length
          ? `参考文件处理完成：${parsedAssets.length} 个可用，${failedAssets.length} 个失败；将继续生成。`
          : `参考文件解析完成（${parsedAssets.length}/${assets.length}）。`,
      completed: terminalAssets.length,
      total: assets.length,
      percent,
      files: progressFiles,
      warnings: [...warnings]
    })

    if (!waitingAssets.length) {
      return references.filter((reference) => parsedAssets.some((asset) => asset.id === reference.fileId))
    }
    if (Date.now() >= deadline) {
      throw new Error(`等待文件解析超时：${waitingAssets.map((item) => item.original_filename).join('、')}。文件仍保留，可稍后重试生成。`)
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000))
  }
}

function toProgressFile(asset: FileAsset) {
  return {
    fileId: asset.id,
    fileName: asset.original_filename,
    parseStatus: asset.parse_status,
    error: asset.parse_error
  }
}

function normalizeExamPaperGenerationResponse(
  response: GeneratedArtifactPayload = {},
  formValues: ExamPaperFormValues
): ExamPaperGenerationResponse {
  const content = response.content || ''
  const artifactId = Number(response.artifact_id || response.id || 0)
  const sections = parseSectionsFromMarkdown(content, parseQuestionRows(formValues.questionDistribution))

  return {
    success: true,
    source: 'api',
    paperId: artifactId,
    artifact_id: artifactId,
    artifact_type: response.artifact_type || 'paper',
    title: response.title || buildExamPaperTitle(formValues),
    message: '试卷生成成功，已保存到生成历史。',
    content,
    content_format: response.content_format || 'markdown',
    created_at: response.created_at,
    quality_analysis: response.quality_analysis || null,
    references: Array.isArray(response.references) ? response.references : [],
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
    data: {
      title: response.title || buildExamPaperTitle(formValues),
      totalScore: Number(formValues.totalScore || 0),
      durationMinutes: parseDurationMinutes(formValues.examDuration),
      difficultyRatio: formValues.difficultyRatio || '中等',
      sections,
      markdown: content
    }
  }
}

function parseSectionsFromMarkdown(content: string, rows: QuestionRow[]): PaperSection[] {
  const sections = rows.map((row) => ({ title: row.type, count: row.count, total: row.total, questions: [] as PaperQuestion[] }))
  const sectionMap = new Map(sections.map((section) => [section.title, section]))
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  let currentSection = sections[0] || { title: '试题', count: 0, total: 0, questions: [] as PaperQuestion[] }
  let currentQuestion: PaperQuestion | null = null
  let questionSerial = 0

  const findOrCreateSection = (heading: string) => {
    const matched = sections.find((section) => heading.includes(section.title) || section.title.includes(heading))
    if (matched) return matched
    if (sectionMap.has(heading)) return sectionMap.get(heading) as PaperSection
    const section = { title: heading, count: 0, total: 0, questions: [] as PaperQuestion[] }
    sectionMap.set(heading, section)
    sections.push(section)
    return section
  }

  const flush = () => {
    if (currentQuestion?.stem) currentSection.questions.push(currentQuestion)
    currentQuestion = null
  }

  lines.forEach((line) => {
    if (/^#{1,6}\s+/.test(line)) {
      const heading = line.replace(/^#{1,6}\s+/, '').replace(/[*_`]/g, '').trim()
      if (/选择|判断|填空|编程|简答|案例|题/.test(heading)) {
        flush()
        currentSection = findOrCreateSection(heading)
      }
      return
    }

    const questionMatch = line.match(/^(?:[-*]\s*)?(\d+)[.、\s]+(.+)$/)
    if (questionMatch) {
      flush()
      questionSerial += 1
      currentQuestion = {
        id: `paper_question_${questionSerial}_${questionMatch[1]}`,
        stem: questionMatch[2],
        options: [],
        answer: '',
        analysis: ''
      }
      return
    }

    if (!currentQuestion) return

    const optionMatch = line.match(/^[-*]?\s*([A-D])(?:[.、:：])\s*(.+)$/i)
    if (optionMatch) {
      currentQuestion.options.push(optionMatch[2])
      return
    }

    if (/答案|参考答案/.test(line)) {
      currentQuestion.answer = stripMarkdownMarker(line)
      return
    }

    if (/解析|评分|说明/.test(line)) {
      currentQuestion.analysis = stripMarkdownMarker(line)
    }
  })

  flush()
  return sections.filter((section) => section.count > 0 || section.questions.length > 0)
}

function stripMarkdownMarker(line: string) {
  return line.replace(/^[-*]\s*/, '').replace(/^#{1,6}\s*/, '').trim()
}

function normalizePaperList(papers: GeneratedArtifactPayload[]): PaperHistoryItem[] {
  if (!Array.isArray(papers)) return []

  return papers.map((paper) => {
    const requestPayload = paper.request_payload || {}
    return {
      id: Number(paper.id || paper.artifact_id),
      title: paper.title || '未命名试卷',
      createdAt: paper.created_at || '',
      totalScore: Number(requestPayload.total_score || 0),
      durationMinutes: Number(requestPayload.duration_minutes || 0),
      status: paper.status || 'completed'
    }
  })
}

function buildExamPaperTitle(values: ExamPaperFormValues) {
  return `${values.courseName || '课程'}试卷`
}

function parseDurationMinutes(value: string) {
  const normalized = String(value || '').trim()
  if (!normalized) return 0
  const number = Number(normalized.match(/\d+(?:\.\d+)?/)?.[0] || 0)
  if (!number) return 0
  if (/小时|hour/i.test(normalized)) return Math.round(number * 60)
  return Math.round(number)
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: buildHeaders(options.headers)
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as ApiResponsePayload<T> | T)
    : ({ message: await response.text() } as ApiResponsePayload<T>)

  if (!response.ok) {
    const message = normalizeErrorMessage(response.status, payload as ApiResponsePayload<T>)
    if (response.status === 401) {
      window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`
    }
    throw new Error(message)
  }

  return unwrapApiPayload(payload)
}

function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path
  const base = API_BASE_URL.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

function buildHeaders(headers: HeadersInit = {}) {
  const token = getAuthToken()
  const nextHeaders = new Headers(headers)
  if (token) nextHeaders.set('Authorization', `Bearer ${token}`)
  return nextHeaders
}

function getAuthToken() {
  return (
    localStorage.getItem('edugenie_access_token') ||
    localStorage.getItem('access_token') ||
    localStorage.getItem('prismmind_access_token') ||
    ''
  )
}

function unwrapApiPayload<T>(payload: ApiResponsePayload<T> | T): T {
  if (payload && typeof payload === 'object' && 'code' in payload && 'data' in payload) {
    const apiPayload = payload as ApiResponsePayload<T>
    if (apiPayload.code !== 0) {
      throw new Error(apiPayload.message || '请求未能完成，请稍后重试。')
    }
    return apiPayload.data as T
  }
  return payload as T
}

function normalizeErrorMessage<T>(status: number, payload: ApiResponsePayload<T>) {
  const message = payload?.message || payload?.detail
  if (typeof message === 'string' && message.trim()) return message.trim()
  if (Array.isArray(message)) return '请求参数不合法，请检查试卷配置。'
  if (status === 401) return '登录状态已失效，请重新登录。'
  if (status === 403) return '当前账号无权访问该功能。'
  if (status === 400 || status === 422) return '请求参数不合法，请检查试卷配置。'
  if (status >= 500) return '生成服务暂时繁忙，请稍后重试。'
  return '请求未能完成，请稍后重试。'
}
