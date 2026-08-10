import request from './request'
import type { TaskCreateResponse } from '@/types/task'
import type { QualityAnalysis } from '@/types/qualityAnalysis'

export type ResourceType =
  | 'course_document'
  | 'mind_map'
  | 'concept_explanation'
  | 'case_study'
  | 'further_reading'
  | 'video_script'
  | 'code_example'
  | 'practice_task'
  | 'summary_notes'
  | 'quiz'
  | 'project_hint'

export type ResourceDifficulty = 'easy' | 'normal' | 'hard'

export interface ResourceGenerateRequest {
  topic: string
  course_id?: number | null
  resource_types: ResourceType[]
  difficulty: ResourceDifficulty
  knowledge_points?: string[] | null
  use_profile: boolean
  use_knowledge_base: boolean
  knowledge_document_ids?: number[] | null
  top_k: number
  additional_requirements?: string | null
}

export interface ResourceGenerateSingleRequest {
  topic: string
  course_id?: number | null
  resource_type: ResourceType
  difficulty: ResourceDifficulty
  knowledge_points?: string[] | null
  use_profile: boolean
  use_knowledge_base: boolean
  knowledge_document_ids?: number[] | null
  top_k: number
  additional_requirements?: string | null
}

export interface ResourceReference {
  document_id?: number | null
  chunk_index?: number | null
  source_filename?: string | null
  excerpt?: string | null
  score?: number | null
}

export interface LearningResource {
  id: number
  course_id?: number | null
  resource_type: ResourceType | string
  title: string
  content: string
  topic?: string | null
  difficulty_level?: string | null
  tags: unknown[]
  is_viewed: boolean
  is_completed: boolean
  user_rating?: number | null
  created_at: string
  updated_at: string
  profile_snapshot?: Record<string, unknown> | null
  reference_snapshot?: ResourceReference[]
  quality_analysis?: QualityAnalysis | null
  generation_task_id?: number | null
  generation_parameters?: Record<string, unknown> | null
}

export interface ResourceGenerateResponse {
  resources: LearningResource[]
  warnings: string[]
  references: ResourceReference[]
}

export interface ResourceListResponse {
  items: LearningResource[]
  total: number
  page: number
  page_size: number
}

export interface ResourceRatingRequest {
  user_rating: number
}

export interface ResourceActionResponse {
  resource_id: number
  is_viewed: boolean
  is_completed: boolean
  user_rating?: number | null
}

export interface ResourceDeleteResponse {
  resource_id: number
  deleted: boolean
}

export const resourceTypeLabels: Record<ResourceType, string> = {
  course_document: '课程文档',
  mind_map: '思维导图',
  concept_explanation: '概念讲解',
  case_study: '案例分析',
  further_reading: '拓展阅读',
  video_script: '视频脚本',
  code_example: '代码案例',
  practice_task: '练习任务',
  summary_notes: '总结笔记',
  quiz: '小测验',
  project_hint: '项目提示'
}

export function generateResources(payload: ResourceGenerateRequest) {
  return request.post<ResourceGenerateResponse, ResourceGenerateResponse>('/student/resources/generate', payload)
}

export function generateResourcesAsync(payload: ResourceGenerateRequest) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/student/resources/generate-async', payload)
}

export function generateSingleResource(payload: ResourceGenerateSingleRequest) {
  return request.post<ResourceGenerateResponse, ResourceGenerateResponse>('/student/resources/generate-single', payload)
}

export function generateSingleResourceAsync(payload: ResourceGenerateSingleRequest) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/student/resources/generate-single-async', payload)
}

export function getResources(params?: {
  page?: number
  page_size?: number
  resource_type?: ResourceType | ''
  topic?: string
  is_completed?: boolean | null
  difficulty_level?: string | null
}) {
  return request.get<ResourceListResponse, ResourceListResponse>('/student/resources', { params })
}

export function listResourcesApi(params?: Record<string, unknown>) {
  return request.get('/student/resources', { params })
}

export function getResource(resourceId: number) {
  return request.get<LearningResource, LearningResource>(`/student/resources/${resourceId}`)
}

export function deleteResource(resourceId: number) {
  return request.delete<ResourceDeleteResponse, ResourceDeleteResponse>(`/student/resources/${resourceId}`)
}

export function markResourceViewed(resourceId: number) {
  return request.post<ResourceActionResponse, ResourceActionResponse>(`/student/resources/${resourceId}/view`)
}

export function markResourceCompleted(resourceId: number) {
  return request.post<ResourceActionResponse, ResourceActionResponse>(`/student/resources/${resourceId}/complete`)
}

export function rateResource(resourceId: number, payload: ResourceRatingRequest) {
  return request.post<ResourceActionResponse, ResourceActionResponse>(`/student/resources/${resourceId}/rating`, payload)
}
