import type { QuestionResult, QuestionType, TestAnswerValue, TestQuestion } from './test'
import type { QualityAnalysis } from './qualityAnalysis'

export type CourseAssignmentType = 'quiz' | 'exam' | 'homework'
export type CourseAssignmentSource = 'manual' | 'ai_generated'
export type CourseAssignmentDifficulty = 'easy' | 'medium' | 'hard'
export type CourseAssignmentStatus = 'draft' | 'published' | 'closed' | 'archived'
export type CourseAssignmentSubmissionStatus = 'not_started' | 'in_progress' | 'submitted' | 'graded'

export interface CourseAssignmentCreateRequest {
  title: string
  description?: string | null
  assignment_type: CourseAssignmentType
  difficulty: CourseAssignmentDifficulty
  question_count: number
  total_score?: number
  time_limit_minutes?: number | null
  due_at?: string | null
  status?: CourseAssignmentStatus
  knowledge_document_ids?: number[]
  generation_mode?: 'ai'
  topic?: string | null
  question_types?: QuestionType[]
}

export interface CourseAssignmentSubmission {
  id: number
  assignment_id: number
  course_id: number
  student_id?: number | null
  student_username?: string | null
  student_full_name?: string | null
  status: CourseAssignmentSubmissionStatus | string
  answers: Record<string, TestAnswerValue>
  score?: number | null
  max_score: number
  feedback: Record<string, unknown>
  question_results: QuestionResult[]
  quality_analysis?: QualityAnalysis | null
  started_at?: string | null
  submitted_at?: string | null
  graded_at?: string | null
  created_at: string
  updated_at: string
}

export interface CourseAssignmentListItem {
  id: number
  course_id: number
  title: string
  description?: string | null
  assignment_type: CourseAssignmentType | string
  source: CourseAssignmentSource | string
  difficulty: CourseAssignmentDifficulty | string
  topic?: string | null
  question_count: number
  total_score: number
  time_limit_minutes?: number | null
  due_at?: string | null
  status: CourseAssignmentStatus | string
  published_at?: string | null
  created_at: string
  updated_at: string
  submitted_count?: number | null
  current_student_submission_status?: CourseAssignmentSubmissionStatus | string | null
  current_student_score?: number | null
}

export interface CourseAssignment extends CourseAssignmentListItem {
  knowledge_document_ids: number[]
  questions: TestQuestion[]
  answer_key?: Record<string, unknown> | null
  explanations?: Record<string, string> | null
  current_student_submission?: CourseAssignmentSubmission | null
  submissions_total?: number | null
  quality_analysis?: QualityAnalysis | null
}

export interface CourseAssignmentListResponse {
  items: CourseAssignmentListItem[]
  total: number
  page: number
  page_size: number
}

export interface CourseAssignmentStartResponse {
  assignment: CourseAssignment
  submission: CourseAssignmentSubmission
}

export interface CourseAssignmentSubmitRequest {
  answers: Record<string, TestAnswerValue>
}

export interface CourseAssignmentSubmitResponse {
  assignment_id: number
  submission_id: number
  status: CourseAssignmentSubmissionStatus | string
  score: number
  max_score: number
  analysis: string
  feedback: string
  question_results: QuestionResult[]
  answer_key: Record<string, unknown>
  recommendations: string[]
  quality_analysis?: QualityAnalysis | null
  profile_snapshot?: Record<string, unknown>
}

export interface CourseAssignmentSubmissionListResponse {
  items: CourseAssignmentSubmission[]
  total: number
  page: number
  page_size: number
  diagnostics: CourseTeachingDiagnostics
}

export interface CourseWeakTopicStat {
  topic: string
  student_count: number
  occurrence_count: number
  rate: number
}

export interface CourseTeachingDiagnostics {
  submitted_count: number
  average_score?: number | null
  average_score_rate?: number | null
  weak_topics: CourseWeakTopicStat[]
  strong_topics: string[]
  evaluation: string
  teaching_focus: string[]
}
