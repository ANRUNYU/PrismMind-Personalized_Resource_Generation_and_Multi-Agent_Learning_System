import request from './request'

export type PathDifficulty = 'easy' | 'normal' | 'hard'
export type LearningPathStatus = 'active' | 'completed' | 'archived' | string

export interface LearningPathCreateRequest {
  title?: string | null
  topic: string
  course_id?: number | null
  target_goal: string
  knowledge_points?: string[] | null
  duration_days: number
  daily_minutes: number
  difficulty: PathDifficulty
  resource_ids?: number[] | null
  use_profile: boolean
  use_existing_resources: boolean
  use_knowledge_base?: boolean
  knowledge_document_ids?: number[] | null
  top_k?: number
  additional_requirements?: string | null
}

export interface LearningPathStep {
  id?: number | null
  step_index: number
  title: string
  objective: string
  knowledge_points: string[]
  suggested_resource_ids: number[]
  learning_activity: string
  practice_task: string
  estimated_minutes: number
  completion_criteria: string
  status: string
  knowledge_point?: string | null
  description?: string | null
  step_test_id?: number | null
  pass_score?: number
  attempt_count?: number
  reflection?: string | null
  topic?: string | null
  course_id?: number | null
}

export interface LearningPathMilestone {
  milestone_index: number
  title: string
  target_step_index: number
  description: string
  is_reached: boolean
}

export interface LearningPath {
  id: number
  title: string
  topic?: string | null
  current_step: number
  completion_rate: number
  status: LearningPathStatus
  path_steps: LearningPathStep[]
  milestones: LearningPathMilestone[]
  warnings?: string[]
  created_at: string
  updated_at: string
}

export interface LearningPathListResponse {
  items: LearningPath[]
  total: number
  page: number
  page_size: number
}

export interface LearningPathAdvanceRequest {
  completed_step_index: number
  reflection?: string | null
  time_spent_minutes?: number | null
}

export interface LearningPathAdvanceResponse {
  path_id: number
  current_step: number
  completion_rate: number
  status: LearningPathStatus
  current_step_detail?: LearningPathStep | null
}

export interface LearningPathQuizRequest {
  step_index: number
  question_count: number
  difficulty: PathDifficulty
}

export interface LearningPathQuizQuestion {
  question: string
  answer: string
}

export interface LearningPathQuizResponse {
  path_id: number
  step_index: number
  quiz_markdown: string
  questions: LearningPathQuizQuestion[]
  test_id?: number | null
}

export interface LearningPathRecommendation {
  title: string
  reason: string
  suggested_action: string
}

export interface LearningPathRecommendationResponse {
  recommendations: LearningPathRecommendation[]
}

export function createLearningPath(payload: LearningPathCreateRequest) {
  return request.post<LearningPath, LearningPath>('/student/learning-paths', payload, { timeout: 180000 })
}

export function getLearningPaths(params?: {
  page?: number
  page_size?: number
  status?: LearningPathStatus | ''
  topic?: string
}) {
  return request.get<LearningPathListResponse, LearningPathListResponse>('/student/learning-paths', { params })
}

export function listLearningPathsApi(params?: Record<string, unknown>) {
  return request.get('/student/learning-paths', { params })
}

export function getLearningPath(pathId: number) {
  return request.get<LearningPath, LearningPath>(`/student/learning-paths/${pathId}`)
}

export function advanceLearningPath(pathId: number, payload: LearningPathAdvanceRequest) {
  return request.post<LearningPathAdvanceResponse, LearningPathAdvanceResponse>(`/student/learning-paths/${pathId}/advance`, payload)
}

export function generateStepQuiz(pathId: number, payload: LearningPathQuizRequest) {
  return request.post<LearningPathQuizResponse, LearningPathQuizResponse>(`/student/learning-paths/${pathId}/quiz`, payload)
}

export function completeLearningPathStep(pathId: number, stepId: number, payload: { reflection?: string; time_spent_minutes?: number }) {
  return request.post<LearningPath, LearningPath>(`/student/learning-paths/${pathId}/steps/${stepId}/complete-learning`, payload)
}

export function getLearningPathRecommendation() {
  return request.get<LearningPathRecommendationResponse, LearningPathRecommendationResponse>('/student/learning-paths/recommendations')
}
