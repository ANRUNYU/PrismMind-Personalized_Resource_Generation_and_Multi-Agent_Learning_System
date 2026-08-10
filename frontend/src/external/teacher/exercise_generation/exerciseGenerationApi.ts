import type { QualityAnalysis } from '@/types/qualityAnalysis'
import type { TaskCreateResponse } from '@/types/task'
import { uploadFilesBatch } from '@/api/files'
import { resolveApiBaseURL } from '@/api/baseUrl'

const API_BASE_URL = resolveApiBaseURL()

export const EXERCISE_GENERATION_ENDPOINTS = {
  generate: '/teacher/exercises/generate',
  generateAsync: '/teacher/exercises/generate-async',
  uploadReference: '/files/upload',
  myExercises: '/teacher/generated-artifacts?artifact_type=exercise&page=1&page_size=10',
  artifactDetail: '/teacher/generated-artifacts'
} as const

export const DIFFICULTY_OPTIONS = ['基础', '中等', '较难', '自定义'] as const

export interface ExerciseGenerationValues {
  courseId: number | null
  courseName: string
  knowledgePoints: string
  difficulty: string
  questionCount: number | string
  questionTypes: string
  referenceContent: string
  referenceFile: File[]
  knowledgeDocumentIds: number[]
}

export interface ExerciseGenerationValidation {
  errors: Partial<Record<keyof ExerciseGenerationValues, string>>
  isValid: boolean
}

export interface ExerciseQuestion {
  id: string
  type: string
  stem: string
  options: string[]
  answer: string
  analysis: string
}

export interface ExerciseReference {
  source_type: string
  file_id?: number | null
  document_id?: number | null
  chunk_index?: number | null
  source_filename?: string | null
  excerpt?: string | null
}

export interface ExerciseGenerationResponse {
  success: true
  source: 'api'
  exerciseSetId: number | string
  artifact_id: number
  artifact_type: string
  title: string
  message: string
  content: string
  content_format: string
  created_at?: string
  quality_analysis?: QualityAnalysis | null
  references: ExerciseReference[]
  warnings: string[]
  data: {
    title: string
    difficulty: string
    questionCount: number
    questionTypes: string[]
    questions: ExerciseQuestion[]
    markdown: string
  }
}

export interface ExerciseHistoryItem {
  id: number
  title: string
  createdAt: string
  difficulty: string
  questionCount: number
  status: string
}

interface UploadedReference {
  fileId: number
  fileName: string
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
  references?: ExerciseReference[] | null
  warnings?: string[] | null
}

interface GeneratedArtifactListPayload {
  items?: GeneratedArtifactPayload[]
  artifacts?: GeneratedArtifactPayload[]
  total?: number
  page?: number
  page_size?: number
}

export function validateExerciseGenerationForm(values: ExerciseGenerationValues): ExerciseGenerationValidation {
  const errors: ExerciseGenerationValidation['errors'] = {}
  const count = Number(values.questionCount)

  if (!values.courseName.trim()) {
    errors.courseName = '请输入课程名称后再生成'
  }

  if (!values.knowledgePoints.trim()) {
    errors.knowledgePoints = '请输入知识点或主题后再生成'
  }

  if (!values.questionTypes.trim()) {
    errors.questionTypes = '请至少选择或填写一种题型'
  }

  if (!String(values.questionCount || '').trim() || Number.isNaN(count) || count < 1) {
    errors.questionCount = '题目数量需要为 1 以上的有效数字'
  } else if (count > 100) {
    errors.questionCount = '题目数量不能超过 100'
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0
  }
}

export async function generateExercises(values: ExerciseGenerationValues): Promise<TaskCreateResponse> {
  const payload = await buildExerciseGenerationPayload(values)
  return requestJson<TaskCreateResponse>(EXERCISE_GENERATION_ENDPOINTS.generateAsync, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

export async function fetchMyExercises(): Promise<{ source: 'api'; exercises: ExerciseHistoryItem[] }> {
  const data = await requestJson<GeneratedArtifactListPayload | GeneratedArtifactPayload[]>(
    EXERCISE_GENERATION_ENDPOINTS.myExercises
  )
  const items = Array.isArray(data) ? data : data.items || data.artifacts || []
  return {
    source: 'api',
    exercises: normalizeExerciseList(items)
  }
}

export async function saveExerciseSet(exerciseSet: ExerciseGenerationResponse) {
  const artifactId = exerciseSet.artifact_id || exerciseSet.exerciseSetId
  if (!artifactId) {
    throw new Error('当前生成结果尚未返回 artifact_id，无法确认保存状态。')
  }

  return {
    source: 'api' as const,
    saved: true,
    exerciseSetId: artifactId,
    message: '当前系统生成后已自动保存到生成历史。'
  }
}

export async function uploadExerciseReferenceFiles(files: File[]): Promise<UploadedReference[]> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  formData.append('purpose', 'teacher_generation_reference')
  const data = await uploadFilesBatch(formData)
  const successful = data.items.filter((item) => item.success && item.file_id)
  if (!successful.length) throw new Error(data.items[0]?.error_message || '参考文件上传失败')
  return successful.map((item) => ({ fileId: Number(item.file_id), fileName: item.original_name }))
}

async function buildExerciseGenerationPayload(values: ExerciseGenerationValues) {
  const uploadedReferences = values.referenceFile.length ? await uploadExerciseReferenceFiles(values.referenceFile) : []
  const referenceText = values.referenceContent.trim()
  const additionalParts: string[] = []

  if (uploadedReferences.length) {
    additionalParts.push(`参考文件已上传：${uploadedReferences.map((item) => item.fileName).join('、')}。`)
  }

  const payload: Record<string, unknown> = {
    course_id: values.courseId,
    course_name: values.courseName.trim(),
    knowledge_points: normalizeTextList(values.knowledgePoints),
    difficulty: values.difficulty || '中等',
    question_count: Number(values.questionCount || 20),
    question_types: normalizeTextList(values.questionTypes),
    reference_text: referenceText || null,
    additional_requirements: additionalParts.length ? additionalParts.join('\n') : null,
    knowledge_document_ids: values.knowledgeDocumentIds.length ? values.knowledgeDocumentIds : null,
    use_knowledge_base: values.knowledgeDocumentIds.length > 0,
    top_k: 5
  }

  if (uploadedReferences.length) {
    payload.file_ids = uploadedReferences.map((item) => item.fileId)
  }

  return payload
}

function normalizeExerciseGenerationResponse(
  response: GeneratedArtifactPayload = {},
  formValues: ExerciseGenerationValues
): ExerciseGenerationResponse {
  const content = response.content || ''
  const questions = parseQuestionsFromMarkdown(content)
  const questionTypes = normalizeTextList(formValues.questionTypes)
  const artifactId = Number(response.artifact_id || response.id || 0)

  return {
    success: true,
    source: 'api',
    exerciseSetId: artifactId,
    artifact_id: artifactId,
    artifact_type: response.artifact_type || 'exercise',
    title: response.title || buildExerciseTitle(formValues),
    message: '习题生成成功，已保存到生成历史。',
    content,
    content_format: response.content_format || 'markdown',
    created_at: response.created_at,
    quality_analysis: response.quality_analysis || null,
    references: Array.isArray(response.references) ? response.references : [],
    warnings: Array.isArray(response.warnings) ? response.warnings : [],
    data: {
      title: response.title || buildExerciseTitle(formValues),
      difficulty: formValues.difficulty || '中等',
      questionCount: Number(formValues.questionCount || questions.length || 0),
      questionTypes,
      questions,
      markdown: content
    }
  }
}

export function normalizeTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  return String(value || '')
    .split(/\r?\n|[,，、/；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseQuestionsFromMarkdown(content: string): ExerciseQuestion[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const questions: ExerciseQuestion[] = []
  let currentType = '习题'
  let current: ExerciseQuestion | null = null
  let questionSerial = 0

  const flush = () => {
    if (current?.stem) {
      questions.push(current)
    }
    current = null
  }

  lines.forEach((line) => {
    if (/^#{2,6}\s+/.test(line)) {
      const heading = line.replace(/^#{2,6}\s+/, '')
      if (/选择|判断|填空|简答|应用|编程|题/.test(heading)) {
        currentType = heading
      }
      return
    }

    const questionMatch = line.match(/^(?:[-*]\s*)?(\d+)[.、]\s*(.+)$/)
    if (questionMatch) {
      flush()
      questionSerial += 1
      current = {
        id: `question_${questionSerial}_${questionMatch[1]}`,
        type: currentType,
        stem: questionMatch[2],
        options: [],
        answer: '',
        analysis: ''
      }
      return
    }

    if (!current) return

    const optionMatch = line.match(/^[-*]\s*([A-DＡ-Ｄ])(?:[.、．])?\s*(.+)$/i)
    if (optionMatch) {
      current.options.push(optionMatch[2])
      return
    }

    if (/答案|参考答案/.test(line)) {
      current.answer = stripMarkdownMarker(line)
      return
    }

    if (/解析|说明/.test(line)) {
      current.analysis = stripMarkdownMarker(line)
    }
  })

  flush()
  return questions.slice(0, 12)
}

function stripMarkdownMarker(line: string) {
  return line.replace(/^[-*]\s*/, '').replace(/^#+\s*/, '').trim()
}

function normalizeExerciseList(exercises: GeneratedArtifactPayload[]): ExerciseHistoryItem[] {
  if (!Array.isArray(exercises)) return []

  return exercises.map((exercise) => {
    const requestPayload = exercise.request_payload || {}
    return {
      id: Number(exercise.id || exercise.artifact_id),
      title: exercise.title || '未命名习题',
      createdAt: exercise.created_at || '',
      difficulty: String(requestPayload.difficulty || '中等'),
      questionCount: Number(requestPayload.question_count || 0),
      status: exercise.status || 'completed'
    }
  })
}

function buildExerciseTitle(values: ExerciseGenerationValues) {
  const knowledgePoints = normalizeTextList(values.knowledgePoints)
  const topic = knowledgePoints.slice(0, 2).join('与') || values.courseName || '智能习题'
  return `${topic}练习`
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
  if (token) {
    nextHeaders.set('Authorization', `Bearer ${token}`)
  }
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
      throw new Error(apiPayload.message || '请求失败。')
    }
    return apiPayload.data as T
  }
  return payload as T
}

function normalizeErrorMessage<T>(status: number, payload: ApiResponsePayload<T>) {
  const message = payload?.message || payload?.detail
  if (typeof message === 'string' && message.trim()) return message.trim()
  if (Array.isArray(message)) return '请求参数不合法，请检查表单内容。'
  if (status === 401) return '登录状态已失效，请重新登录。'
  if (status === 403) return '当前账号无权访问该功能。'
  if (status === 400 || status === 422) return '请求参数不合法，请检查表单内容。'
  if (status >= 500) return '生成服务暂时繁忙，请稍后重试。'
  return '请求未能完成，请稍后重试。'
}
