import request from './request'
import type { TaskCreateResponse } from '@/types/task'
import type { QualityAnalysis } from '@/types/qualityAnalysis'

export type ArtifactType =
  | 'training_plan'
  | 'course_design'
  | 'teaching_design'
  | 'exercise'
  | 'paper'
  | 'project_practice'

export interface GenerationReference {
  source_type: 'file' | 'knowledge_chunk' | string
  file_id?: number | null
  document_id?: number | null
  chunk_index?: number | null
  source_filename?: string | null
  excerpt?: string | null
}

export interface TeacherGenerationResponse {
  artifact_id: number
  artifact_type: ArtifactType
  title: string
  content: string
  content_format: string
  status: string
  created_at: string
  warnings?: string[] | null
  references?: GenerationReference[] | null
  quality_analysis?: QualityAnalysis | null
}

export interface GeneratedArtifactListItem {
  id?: number
  artifact_id?: number
  artifact_type: ArtifactType
  title: string
  status: string
  content_format?: string
  created_at: string
}

export interface GeneratedArtifactDetail extends GeneratedArtifactListItem {
  id: number
  owner_id?: number
  content: string
  request_payload?: Record<string, unknown> | null
  references?: GenerationReference[] | null
  warnings?: string[] | null
  quality_analysis?: QualityAnalysis | null
  model_name?: string | null
  updated_at?: string
}

export interface GeneratedArtifactListResponse {
  items?: GeneratedArtifactListItem[]
  total?: number
  page?: number
  page_size?: number
  artifacts?: GeneratedArtifactListItem[]
}

export interface GenerationReferencePayload {
  course_id?: number | null
  file_ids?: number[] | null
  knowledge_document_ids?: number[] | null
  use_knowledge_base?: boolean
  retrieval_query?: string | null
  top_k?: number
}

export type TeacherGenerationPayload = Record<string, unknown> & GenerationReferencePayload

export const artifactTypeLabels: Record<ArtifactType, string> = {
  training_plan: '培养方案',
  course_design: '课程设计',
  teaching_design: '教学设计',
  exercise: '练习题',
  paper: '试卷',
  project_practice: '项目实践'
}

export function generateTrainingPlan(payload: TeacherGenerationPayload) {
  return request.post<TeacherGenerationResponse, TeacherGenerationResponse>('/teacher/training-plans/generate', payload)
}

export function generateTrainingPlanAsync(payload: TeacherGenerationPayload) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/teacher/training-plans/generate-async', payload)
}

export function generateCourseDesign(payload: TeacherGenerationPayload) {
  return request.post<TeacherGenerationResponse, TeacherGenerationResponse>('/teacher/course-designs/generate', payload)
}

export function generateCourseDesignAsync(payload: TeacherGenerationPayload) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/teacher/course-designs/generate-async', payload)
}

export function generateTeachingDesign(payload: TeacherGenerationPayload) {
  return request.post<TeacherGenerationResponse, TeacherGenerationResponse>('/teacher/teaching-designs/generate', payload)
}

export function generateTeachingDesignAsync(payload: TeacherGenerationPayload) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/teacher/teaching-designs/generate-async', payload)
}

export function generateExercises(payload: TeacherGenerationPayload) {
  return request.post<TeacherGenerationResponse, TeacherGenerationResponse>('/teacher/exercises/generate', payload)
}

export function generateExercisesAsync(payload: TeacherGenerationPayload) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/teacher/exercises/generate-async', payload)
}

export function generatePaper(payload: TeacherGenerationPayload) {
  return request.post<TeacherGenerationResponse, TeacherGenerationResponse>('/teacher/papers/generate', payload)
}

export function generatePaperAsync(payload: TeacherGenerationPayload) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/teacher/papers/generate-async', payload)
}

export function generateProject(payload: TeacherGenerationPayload) {
  return request.post<TeacherGenerationResponse, TeacherGenerationResponse>('/teacher/projects/generate', payload)
}

export function generateProjectAsync(payload: TeacherGenerationPayload) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/teacher/projects/generate-async', payload)
}

export function getGeneratedArtifacts(params?: {
  artifact_type?: ArtifactType | ''
  page?: number
  page_size?: number
}) {
  const cleanParams = {
    ...params,
    artifact_type: params?.artifact_type || undefined
  }
  return request.get<GeneratedArtifactListResponse | GeneratedArtifactListItem[], GeneratedArtifactListResponse | GeneratedArtifactListItem[]>(
    '/teacher/generated-artifacts',
    { params: cleanParams }
  )
}

export function getGeneratedArtifact(id: number | string) {
  return request.get<GeneratedArtifactDetail, GeneratedArtifactDetail>(`/teacher/generated-artifacts/${id}`)
}
