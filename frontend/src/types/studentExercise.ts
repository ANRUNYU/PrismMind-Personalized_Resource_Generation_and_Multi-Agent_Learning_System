import type { QualityAnalysis } from './qualityAnalysis'
import type { QuestionResult, TestAnswerValue, TestQuestion } from './test'

export type StudentExerciseSource = 'personal' | 'assignment'

export interface StudentExerciseSummary {
  id: string
  source: StudentExerciseSource
  personal_id?: number | null
  course_id?: number | null
  assignment_id?: number | null
  course_name?: string | null
  title: string
  description?: string | null
  content?: string | null
  category: string
  difficulty: string
  status: string
  status_label?: string | null
  is_favorite: boolean
  score?: number | null
  total_score: number
  tags: string[]
  question_count: number
  due_at?: string | null
  started_at?: string | null
  submitted_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export interface StudentExerciseRead extends StudentExerciseSummary {
  questions: TestQuestion[]
  answer_key?: Record<string, unknown> | null
  explanation?: string | null
  feedback?: string | null
  user_answers: Record<string, TestAnswerValue>
  question_results: QuestionResult[]
  quality_analysis?: QualityAnalysis | Record<string, unknown> | null
}

export interface StudentExerciseListResponse {
  items: StudentExerciseSummary[]
  total: number
  page: number
  page_size: number
}

export interface StudentExerciseCreateRequest {
  title: string
  description?: string | null
  content: string
  answer?: string | null
  explanation?: string | null
  difficulty?: string
  category?: string
  tags?: string[]
  total_score?: number
}

export interface StudentExerciseUpdateRequest extends Partial<StudentExerciseCreateRequest> {}

export interface StudentExerciseStartResponse {
  exercise: StudentExerciseRead
}

export interface StudentExerciseSubmitRequest {
  answers: Record<string, TestAnswerValue>
}

export interface StudentExerciseSubmitResponse {
  exercise: StudentExerciseRead
  status: string
  score: number
  max_score: number
  analysis: string
  feedback: string
  question_results: QuestionResult[]
  answer_key: Record<string, unknown>
  quality_analysis?: QualityAnalysis | Record<string, unknown> | null
}
