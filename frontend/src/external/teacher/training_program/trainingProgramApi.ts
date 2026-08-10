import type { QualityAnalysis } from '@/types/qualityAnalysis'
import type { TaskCreateResponse } from '@/types/task'
import { getFile, uploadFilesBatch } from '@/api/files'
import { resolveApiBaseURL } from '@/api/baseUrl'

const API_BASE_URL = resolveApiBaseURL()

export const TRAINING_PROGRAM_ENDPOINTS = {
  extractSkills: '/teacher/training-plans/extract-skills',
  generatePlan: '/teacher/training-plans/generate-async',
  uploadReference: '/files/upload',
  myPlans: '/teacher/generated-artifacts?artifact_type=training_plan&page=1&page_size=10',
  artifactDetail: '/teacher/generated-artifacts'
} as const

export interface TrainingProgramFormValues {
  courseId: number | null
  programName: string
  educationLevel: string
  majorName: string
  focusPrompt: string
  uploadedFile: File[]
  knowledgeDocumentIds: number[]
}

export interface TrainingSkill {
  name: string
  category: string
  level?: string
  description: string
  related_courses?: string[]
  weight?: string | null
}

export interface TrainingPlanReference {
  source_type: string
  file_id?: number | null
  document_id?: number | null
  chunk_index?: number | null
  source_filename?: string | null
  excerpt?: string | null
}

export interface ExtractedTrainingSkills {
  source: 'api'
  fileId?: number
  fileIds?: number[]
  fileName?: string
  skills: TrainingSkill[]
  summary: string
  suggestedObjectives: string[]
  suggestedGraduationRequirements: string[]
  suggestedCoreCourses: string[]
  industryRequirements: string
  references: TrainingPlanReference[]
  warnings: string[]
  quality_analysis?: QualityAnalysis | null
}

export interface TrainingPlanSection {
  title: string
  content: string
}

export interface TrainingPlanPreview {
  goal: string
  coreAbilities: string[]
  modules: TrainingPlanSection[]
  stages: TrainingPlanSection[]
  practiceProjects: string[]
  assessment: string
  markdown: string
}

export interface TrainingPlanGenerationResponse {
  source: 'api'
  artifact_id: number
  artifact_type: string
  title: string
  content: string
  content_format: string
  created_at?: string
  plan: TrainingPlanPreview
  quality_analysis?: QualityAnalysis | null
  references: TrainingPlanReference[]
  warnings: string[]
}

export interface TrainingPlanHistoryItem {
  id: number
  title: string
  createdAt: string
  status: string
}

interface ApiResponsePayload<T> {
  code?: number
  message?: string
  data?: T
  detail?: unknown
}

interface UploadedReferencePayload {
  id: number
  original_filename?: string
}

interface ExtractSkillsPayload {
  skills?: TrainingSkill[]
  summary?: string
  suggested_objectives?: string[]
  suggested_graduation_requirements?: string[]
  suggested_core_courses?: string[]
  industry_requirements?: string | null
  warnings?: string[] | null
  references?: TrainingPlanReference[] | null
  quality_analysis?: QualityAnalysis | null
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
  references?: TrainingPlanReference[] | null
  warnings?: string[] | null
}

interface GeneratedArtifactListPayload {
  items?: GeneratedArtifactPayload[]
  total?: number
  page?: number
  page_size?: number
}

export function validateTrainingProgramForm(values: TrainingProgramFormValues) {
  const errors: Partial<Record<keyof TrainingProgramFormValues, string>> = {}

  if (!values.programName.trim()) {
    errors.programName = '请填写培养方案名称。'
  }
  if (!values.educationLevel.trim()) {
    errors.educationLevel = '请填写培养层次。'
  }
  if (!values.majorName.trim()) {
    errors.majorName = '请填写专业名称。'
  }
  return {
    errors,
    isValid: Object.keys(errors).length === 0
  }
}

export async function extractCoreSkills(
  values: TrainingProgramFormValues,
  onProgress?: (message: string) => void
): Promise<ExtractedTrainingSkills> {
  const uploadedReferences = values.uploadedFile.length ? await uploadTrainingReferenceFiles(values.uploadedFile) : []
  if (uploadedReferences.length) {
    await waitForTrainingReferences(uploadedReferences, onProgress)
  }
  const focusPrompt = buildSkillExtractionPrompt(values)
  const data = await requestJson<ExtractSkillsPayload>(TRAINING_PROGRAM_ENDPOINTS.extractSkills, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      focus_prompt: focusPrompt || null,
      course_id: values.courseId,
      additional_requirements: values.focusPrompt.trim() || null,
      file_ids: uploadedReferences.map((item) => item.fileId),
      uploaded_file_id: uploadedReferences[0]?.fileId || null,
      knowledge_document_ids: values.knowledgeDocumentIds.length ? values.knowledgeDocumentIds : null,
      use_knowledge_base: values.knowledgeDocumentIds.length > 0,
      top_k: 5
    })
  })

  const skills = normalizeSkills(data.skills || [])
  const suggestedObjectives = normalizeTextList(data.suggested_objectives)
  const suggestedGraduationRequirements = normalizeTextList(data.suggested_graduation_requirements)
  const suggestedCoreCourses = normalizeTextList(data.suggested_core_courses)
  return {
    source: 'api',
    fileId: uploadedReferences[0]?.fileId,
    fileIds: uploadedReferences.map((item) => item.fileId),
    fileName: uploadedReferences.map((item) => item.fileName).join('、'),
    skills,
    summary: data.summary || '',
    suggestedObjectives,
    suggestedGraduationRequirements,
    suggestedCoreCourses: suggestedCoreCourses.length
      ? suggestedCoreCourses
      : normalizeTextList(skills.flatMap((skill) => skill.related_courses || skill.name)),
    industryRequirements: data.industry_requirements || '',
    references: Array.isArray(data.references) ? data.references : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    quality_analysis: data.quality_analysis || null
  }
}

export async function generateTrainingPlan(values: TrainingProgramFormValues, extraction: ExtractedTrainingSkills) {
  const coreCourses = extraction.suggestedCoreCourses.length
    ? extraction.suggestedCoreCourses
    : normalizeTextList(extraction.skills.flatMap((skill) => skill.related_courses || skill.name))
  const payload = {
    course_id: values.courseId,
    program_name: values.programName.trim(),
    education_level: values.educationLevel.trim(),
    major_name: values.majorName.trim(),
    training_objectives: extraction.suggestedObjectives.join('\n') || values.focusPrompt.trim() || null,
    graduation_requirements: extraction.suggestedGraduationRequirements.join('\n') || null,
    core_courses: coreCourses,
    industry_requirements: extraction.industryRequirements || null,
    additional_requirements: buildAdditionalRequirements(values, extraction),
    file_ids: extraction.fileIds?.length ? extraction.fileIds : extraction.fileId ? [extraction.fileId] : null,
    knowledge_document_ids: values.knowledgeDocumentIds.length ? values.knowledgeDocumentIds : null,
    use_knowledge_base: values.knowledgeDocumentIds.length > 0,
    top_k: 5
  }
  return requestJson<TaskCreateResponse>(TRAINING_PROGRAM_ENDPOINTS.generatePlan, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

function buildSkillExtractionPrompt(values: TrainingProgramFormValues) {
  const teacherFocus = values.focusPrompt.trim()
  if (teacherFocus) return teacherFocus
  return [
    `培养方案名称：${values.programName.trim()}`,
    `培养层次：${values.educationLevel.trim()}`,
    `专业名称：${values.majorName.trim()}`,
    '未指定参考文件或知识库资料，请基于以上专业与培养层次提取通用核心技能、培养目标、毕业要求和核心课程。'
  ].join('\n')
}

async function waitForTrainingReferences(
  references: Array<{ fileId: number; fileName: string }>,
  onProgress?: (message: string) => void
) {
  const deadline = Date.now() + 30 * 60 * 1000
  while (true) {
    const assets = await Promise.all(references.map((item) => getFile(item.fileId)))
    const failed = assets.find((item) => item.parse_status === 'failed')
    if (failed) throw new Error(`文件“${failed.original_filename}”解析失败：${failed.parse_error || '未知错误'}`)
    const waiting = assets.filter((item) => item.parse_status === 'pending' || item.parse_status === 'parsing')
    if (!waiting.length) return
    if (Date.now() >= deadline) throw new Error(`等待文件解析超时：${waiting.map((item) => item.original_filename).join('、')}`)
    onProgress?.(`正在解析 ${waiting.length} 个参考文件，请保持页面打开：${waiting.slice(0, 3).map((item) => item.original_filename).join('、')}`)
    await new Promise((resolve) => window.setTimeout(resolve, 2000))
  }
}

export async function saveTrainingPlan(plan: TrainingPlanGenerationResponse) {
  if (!plan.artifact_id) {
    throw new Error('当前生成结果尚未返回 artifact_id，无法确认保存状态。')
  }
  return {
    source: 'api' as const,
    saved: true,
    planId: plan.artifact_id,
    message: '培养方案生成后已自动保存到生成历史。'
  }
}

export async function fetchMyTrainingPlans(): Promise<{ source: 'api'; plans: TrainingPlanHistoryItem[] }> {
  const data = await requestJson<GeneratedArtifactListPayload | GeneratedArtifactPayload[]>(TRAINING_PROGRAM_ENDPOINTS.myPlans)
  const items = Array.isArray(data) ? data : data.items || []
  return {
    source: 'api',
    plans: items.map((item) => ({
      id: Number(item.id || item.artifact_id || 0),
      title: item.title || '未命名培养方案',
      createdAt: item.created_at || '',
      status: item.status || 'completed'
    }))
  }
}

export async function uploadTrainingReferenceFiles(files: File[]) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  formData.append('purpose', 'teacher_generation_reference')
  const data = await uploadFilesBatch(formData)
  const successful = data.items.filter((item) => item.success && item.file_id)
  if (!successful.length) throw new Error(data.items[0]?.error_message || '参考文件上传失败')
  return successful.map((item) => ({ fileId: Number(item.file_id), fileName: item.original_name }))
}

function normalizeTrainingPlanResponse(
  response: GeneratedArtifactPayload = {},
  values: TrainingProgramFormValues,
  extraction: ExtractedTrainingSkills
): TrainingPlanGenerationResponse {
  const content = response.content || ''
  const artifactId = Number(response.artifact_id || response.id || 0)
  const parsedPlan = parseTrainingPlanContent(content)
  const skillNames = extraction.skills.map((skill) => skill.name).filter(Boolean)
  return {
    source: 'api',
    artifact_id: artifactId,
    artifact_type: response.artifact_type || 'training_plan',
    title: response.title || `${values.majorName || values.programName}培养方案`,
    content,
    content_format: response.content_format || 'markdown',
    created_at: response.created_at,
    quality_analysis: response.quality_analysis || extraction.quality_analysis || null,
    references: Array.isArray(response.references) ? response.references : extraction.references,
    warnings: Array.isArray(response.warnings) ? response.warnings : extraction.warnings,
    plan: {
      goal: parsedPlan.goal || extraction.suggestedObjectives[0] || extractFirstParagraph(content),
      coreAbilities: parsedPlan.coreAbilities.length ? parsedPlan.coreAbilities : skillNames.slice(0, 8),
      modules: parsedPlan.modules,
      stages: parsedPlan.stages,
      practiceProjects: parsedPlan.practiceProjects,
      assessment: parsedPlan.assessment,
      markdown: content
    }
  }
}

function normalizeSkills(value: TrainingSkill[]): TrainingSkill[] {
  if (!Array.isArray(value) || value.length === 0) {
    return []
  }
  return value.map((skill, index) => ({
    name: skill.name || `能力项 ${index + 1}`,
    category: skill.category || '核心能力',
    level: skill.level || '',
    description: skill.description || '已从当前材料中识别的能力项。',
    related_courses: normalizeTextList(skill.related_courses),
    weight: skill.weight || null
  }))
}

export function normalizeTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  return String(value || '')
    .split(/\r?\n|[,，、；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildAdditionalRequirements(values: TrainingProgramFormValues, extraction: ExtractedTrainingSkills) {
  const skillNames = extraction.skills.map((skill) => skill.name).filter(Boolean).join('、')
  const parts = [
    values.focusPrompt.trim() ? `教师关注点：${values.focusPrompt.trim()}` : '',
    extraction.summary ? `技能提取摘要：${extraction.summary}` : '',
    extraction.fileName ? `参考文件：${extraction.fileName}` : '',
    skillNames ? `已提取核心技能：${skillNames}` : ''
  ].filter(Boolean)
  return parts.join('\n')
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
  if (status === 401) return '登录状态已失效，请重新登录。'
  if (status === 403) return '当前账号无权访问该功能。'
  if (status === 400 || status === 422) return '请求参数不合法，请检查表单内容。'
  if (status >= 500) return '服务端异常，请稍后重试。'
  return '请求未能完成，请稍后重试。'
}

function parseTrainingPlanContent(content: string): Omit<TrainingPlanPreview, 'markdown'> {
  const sections = collectMarkdownSections(content)
  const goalSection = findSection(sections, ['培养目标', '建设目标', '总体目标', '目标'])
  const abilitySection = findSection(sections, ['核心能力', '能力要求', '毕业要求', '能力指标'])
  const moduleSections = findSections(sections, ['课程模块', '课程体系', '课程结构', '模块'])
  const stageSections = findSections(sections, ['阶段安排', '实施阶段', '进度安排', '培养阶段'])
  const practiceSection = findSection(sections, ['实践项目', '实践环节', '项目实践', '实践'])
  const assessmentSection = findSection(sections, ['评估方式', '评价方式', '考核方式', '质量评价', '评价'])

  return {
    goal: extractFirstParagraph(goalSection?.body || ''),
    coreAbilities: extractListItems(abilitySection?.body || ''),
    modules: moduleSections.flatMap(sectionToPlanSections),
    stages: stageSections.flatMap(sectionToPlanSections),
    practiceProjects: extractListItems(practiceSection?.body || ''),
    assessment: compactText(assessmentSection?.body || '')
  }
}

interface MarkdownSection {
  title: string
  body: string
}

function collectMarkdownSections(content: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  let currentTitle = '正文'
  let currentLines: string[] = []

  content.split(/\r?\n/).forEach((line) => {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/)
    if (heading) {
      pushSection(sections, currentTitle, currentLines)
      currentTitle = cleanMarkdownText(heading[1])
      currentLines = []
      return
    }
    currentLines.push(line)
  })
  pushSection(sections, currentTitle, currentLines)

  return sections
}

function pushSection(sections: MarkdownSection[], title: string, lines: string[]) {
  const body = lines.join('\n').trim()
  if (!body && title === '正文') return
  sections.push({ title, body })
}

function findSection(sections: MarkdownSection[], keywords: string[]) {
  return sections.find((section) => keywords.some((keyword) => section.title.includes(keyword)))
}

function findSections(sections: MarkdownSection[], keywords: string[]) {
  return sections.filter((section) => keywords.some((keyword) => section.title.includes(keyword)))
}

function sectionToPlanSections(section: MarkdownSection): TrainingPlanSection[] {
  const listItems = extractListItems(section.body)
  if (listItems.length > 1) {
    return listItems.map((item, index) => {
      const [title, content] = splitSectionLine(item)
      return {
        title: title || `${section.title} ${index + 1}`,
        content: content || item
      }
    })
  }
  if (!section.body.trim()) return []
  return [{ title: section.title, content: compactText(section.body) }]
}

function extractListItems(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) => cleanMarkdownText(line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '')))
    .filter(Boolean)
}

function splitSectionLine(value: string): [string, string] {
  const match = value.match(/^(.{2,28}?)[：:]\s*(.+)$/)
  if (!match) return ['', value]
  return [cleanMarkdownText(match[1]), cleanMarkdownText(match[2])]
}

function extractFirstParagraph(content: string) {
  const paragraph = content
    .split(/\n\s*\n/)
    .map((item) => cleanMarkdownText(item))
    .find(Boolean)
  return paragraph || ''
}

function compactText(value: string) {
  return cleanMarkdownText(value).replace(/\s*\n+\s*/g, ' ')
}

function cleanMarkdownText(value: string) {
  return value
    .replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
}
