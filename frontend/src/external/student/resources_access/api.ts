import {
  deleteResource,
  generateResourcesAsync,
  getResource,
  getResources,
  markResourceCompleted,
  markResourceViewed,
  rateResource,
  resourceTypeLabels,
  type LearningResource,
  type ResourceGenerateResponse,
  type ResourceReference,
  type ResourceType
} from '@/api/resources'
import { getKnowledgeDocuments, type KnowledgeDocument } from '@/api/knowledge'
import type { TaskCreateResponse } from '@/types/task'
import type { QualityAnalysis } from '@/types/qualityAnalysis'

export const externalResourceTypes = [
  '课程文档',
  '思维导图',
  '练习题',
  '拓展阅读',
  '视频脚本',
  '代码案例',
  '小测验',
  '实践项目'
] as const

export type ExternalResourceType = (typeof externalResourceTypes)[number]
export type ExternalResourceStatus = '已生成' | '已查看' | '已完成' | '生成中' | '失败'

export interface ExternalLearningResource {
  id: number
  title: string
  type: ExternalResourceType | string
  apiType: ResourceType | string
  status: ExternalResourceStatus
  createdAt: string
  updatedAt: string
  topic: string
  difficulty: string
  content: string
  tags: string[]
  completed: boolean
  viewed: boolean
  rating: number | null
  source: string
  profileSnapshot: Record<string, unknown> | null
  references: ResourceReference[]
  qualityAnalysis: QualityAnalysis | null
  generationTaskId: number | null
  raw: LearningResource
}

export interface ExternalResourceList {
  resources: ExternalLearningResource[]
  total: number
  page: number
  pageSize: number
}

export interface GenerateExternalResourcesPayload {
  topic: string
  resourceTypes: ExternalResourceType[]
  difficulty: 'easy' | 'normal' | 'hard'
  knowledgePoints?: string[]
  additionalRequirements?: string
  knowledgeDocumentIds?: number[]
}

export interface GenerateExternalResourcesResult {
  resources: ExternalLearningResource[]
  warnings: string[]
  references: ResourceReference[]
}

const externalToApiType: Record<ExternalResourceType, ResourceType> = {
  课程文档: 'concept_explanation',
  思维导图: 'summary_notes',
  练习题: 'practice_task',
  拓展阅读: 'case_study',
  视频脚本: 'summary_notes',
  代码案例: 'case_study',
  小测验: 'quiz',
  实践项目: 'project_hint'
}

const apiTypeToExternalLabel: Record<string, ExternalResourceType | string> = {
  course_document: '课程文档',
  mind_map: '思维导图',
  concept_explanation: '课程文档',
  case_study: '拓展阅读',
  further_reading: '拓展阅读',
  video_script: '视频脚本',
  code_example: '代码案例',
  practice_task: '练习题',
  summary_notes: '思维导图',
  quiz: '小测验',
  project_hint: '实践项目'
}

export const externalApiPaths = {
  list: '/api/v1/student/resources',
  generate: '/api/v1/student/resources/generate',
  generateAsync: '/api/v1/student/resources/generate-async',
  detail: '/api/v1/student/resources/{id}',
  delete: '/api/v1/student/resources/{id}',
  view: '/api/v1/student/resources/{id}/view',
  complete: '/api/v1/student/resources/{id}/complete',
  rating: '/api/v1/student/resources/{id}/rating'
}

export async function fetchExternalResources(params: {
  page?: number
  pageSize?: number
  topic?: string
  externalType?: ExternalResourceType | ''
  status?: '' | 'active' | 'completed'
} = {}): Promise<ExternalResourceList> {
  const data = await getResources({
    page: params.page ?? 1,
    page_size: params.pageSize ?? 20,
    topic: params.topic || undefined,
    resource_type: params.externalType ? externalToApiType[params.externalType] : '',
    is_completed: params.status === 'completed' ? true : params.status === 'active' ? false : null
  })

  return {
    resources: data.items.map(mapResource),
    total: data.total,
    page: data.page,
    pageSize: data.page_size
  }
}

export async function fetchExternalResourceDetail(id: number): Promise<ExternalLearningResource> {
  await markResourceViewed(id)
  const resource = await getResource(id)
  return mapResource(resource)
}

export async function deleteExternalResource(id: number): Promise<void> {
  await deleteResource(id)
}

export async function fetchReadyKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const response = await getKnowledgeDocuments({ page: 1, page_size: 100 })
  return response.items.filter((document) => document.status === 'ingested')
}

export async function generateExternalResources(payload: GenerateExternalResourcesPayload): Promise<TaskCreateResponse> {
  return generateExternalResourcesAsync(payload)
}

export async function generateExternalResourcesAsync(
  payload: GenerateExternalResourcesPayload
): Promise<TaskCreateResponse> {
  return generateResourcesAsync({
    topic: payload.topic,
    course_id: null,
    resource_types: payload.resourceTypes.map((type) => externalToApiType[type]),
    difficulty: payload.difficulty,
    knowledge_points: payload.knowledgePoints?.length ? payload.knowledgePoints : null,
    use_profile: true,
    use_knowledge_base: Boolean(payload.knowledgeDocumentIds?.length),
    knowledge_document_ids: payload.knowledgeDocumentIds?.length ? payload.knowledgeDocumentIds : null,
    top_k: 5,
    additional_requirements: payload.additionalRequirements || null
  })
}

export async function completeExternalResource(resource: ExternalLearningResource): Promise<ExternalLearningResource> {
  await markResourceCompleted(resource.id)
  return fetchExternalResourceDetail(resource.id)
}

export async function rateExternalResource(resource: ExternalLearningResource, rating: number): Promise<ExternalLearningResource> {
  await rateResource(resource.id, { user_rating: rating })
  return fetchExternalResourceDetail(resource.id)
}

export async function regenerateExternalResource(
  resource: ExternalLearningResource,
  selectedKnowledgeDocumentIds: number[] = []
): Promise<TaskCreateResponse> {
  const previousDocumentIds = Array.isArray(resource.raw.generation_parameters?.knowledge_document_ids)
    ? resource.raw.generation_parameters.knowledge_document_ids.filter((value): value is number => typeof value === 'number')
    : []
  return generateExternalResources({
    topic: resource.topic || resource.title,
    resourceTypes: [toExternalType(resource.apiType)],
    difficulty: normalizeDifficulty(resource.difficulty),
    knowledgeDocumentIds: selectedKnowledgeDocumentIds.length ? selectedKnowledgeDocumentIds : previousDocumentIds,
    additionalRequirements: `基于资源「${resource.title}」重新生成，并补充更清晰的学习步骤。`
  })
}

export function buildDownloadText(resource: ExternalLearningResource) {
  const tags = resource.tags.length ? resource.tags.join('、') : '无'
  return [
    `# ${resource.title}`,
    '',
    `类型：${resource.type}`,
    `主题：${resource.topic || '未标注'}`,
    `难度：${difficultyText(resource.difficulty)}`,
    `状态：${resource.status}`,
    `评分：${resource.rating ? `${resource.rating} 星` : '未评分'}`,
    `标签：${tags}`,
    '',
    resource.content || '暂无内容'
  ].join('\n')
}

export function difficultyText(value?: string | null) {
  if (value === 'easy') return '基础'
  if (value === 'hard') return '挑战'
  return '常规'
}

export function statusText(resource: ExternalLearningResource): ExternalResourceStatus {
  if (resource.completed) return '已完成'
  if (resource.viewed) return '已查看'
  return '已生成'
}

export function typeText(value?: string | null) {
  if (!value) return '学习资源'
  if (value in resourceTypeLabels) return resourceTypeLabels[value as ResourceType]
  return apiTypeToExternalLabel[value] || value
}

export function normalizeExternalError(error: unknown, defaultMessage: string) {
  if (error instanceof Error && error.message) return error.message
  return defaultMessage
}

function mapGenerateResponse(response: ResourceGenerateResponse): GenerateExternalResourcesResult {
  return {
    resources: response.resources.map(mapResource),
    warnings: response.warnings || [],
    references: response.references || []
  }
}

function mapResource(resource: LearningResource): ExternalLearningResource {
  const tags = Array.isArray(resource.tags) ? resource.tags.map((tag) => String(tag)).filter(Boolean) : []
  const mapped: ExternalLearningResource = {
    id: resource.id,
    title: resource.title,
    type: typeText(resource.resource_type),
    apiType: resource.resource_type,
    status: '已生成',
    createdAt: formatResourceTime(resource.created_at),
    updatedAt: formatResourceTime(resource.updated_at),
    topic: resource.topic || resource.title,
    difficulty: resource.difficulty_level || 'normal',
    content: resource.content || '',
    tags,
    completed: Boolean(resource.is_completed),
    viewed: Boolean(resource.is_viewed),
    rating: resource.user_rating == null ? null : Number(resource.user_rating),
    source: resource.course_id ? `课程 #${resource.course_id}` : '个性化学习资源',
    profileSnapshot: resource.profile_snapshot || null,
    references: resource.reference_snapshot || [],
    qualityAnalysis: resource.quality_analysis || null,
    generationTaskId: resource.generation_task_id || null,
    raw: resource
  }
  mapped.status = statusText(mapped)
  return mapped
}

function toExternalType(value: string): ExternalResourceType {
  const label = apiTypeToExternalLabel[value]
  return externalResourceTypes.includes(label as ExternalResourceType) ? (label as ExternalResourceType) : '课程文档'
}

function normalizeDifficulty(value?: string | null): 'easy' | 'normal' | 'hard' {
  if (value === 'easy' || value === 'hard') return value
  return 'normal'
}

function formatResourceTime(value?: string | null) {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
