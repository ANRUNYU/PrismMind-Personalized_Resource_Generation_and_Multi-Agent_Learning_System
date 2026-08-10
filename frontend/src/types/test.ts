import type { QualityAnalysis } from './qualityAnalysis'

export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer'
export type StudentTestDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'
export type StudentTestStatus = 'generated' | 'in_progress' | 'submitted' | 'cancelled' | string

export type TestAnswerValue = string | string[] | boolean

export interface TestQuestionOption {
  key: string
  text: string
}

export interface TestQuestion {
  id: string
  question_type: QuestionType
  stem: string
  options?: TestQuestionOption[]
  knowledge_points?: string[]
  score?: number
}

export interface TestGeneratePayload {
  topic: string
  difficulty: StudentTestDifficulty
  question_count: number
  question_types: QuestionType[]
  knowledge_points?: string[]
  resource_id?: number | null
  path_id?: number | null
  learning_path_id?: number | null
  learning_path_step_id?: number | null
  file_ids?: number[]
  knowledge_document_ids?: number[]
  use_knowledge_base?: boolean
  top_k?: number
  course_id?: number | null
  use_question_bank: boolean
}

export interface StudentTestSummary {
  id: number
  topic: string
  difficulty?: StudentTestDifficulty | string | null
  status: StudentTestStatus
  score?: number | null
  question_count: number
  total_score: number
  created_at: string
  started_at?: string | null
  submitted_at?: string | null
}

export interface TestDetail extends StudentTestSummary {
  questions: TestQuestion[]
  analysis?: string | null
  feedback?: string | null
  user_answers?: Record<string, TestAnswerValue> | null
  answers?: Record<string, unknown> | null
  question_results?: QuestionResult[] | null
  quality_analysis?: QualityAnalysis | null
  evidence_snapshot?: Record<string, unknown>
  source_file_ids?: number[]
  source_document_ids?: number[]
  source_chunk_ids?: Array<number | string>
  generation_parameters?: Record<string, unknown>
  updated_at?: string | null
}

export interface TestGenerateResponse {
  test_id: number
  topic: string
  difficulty?: StudentTestDifficulty | string | null
  status: StudentTestStatus
  questions: TestQuestion[]
  question_count: number
  created_at: string
  references?: Array<Record<string, unknown>>
  warnings?: string[]
  quality_analysis?: QualityAnalysis | null
}

export interface TestListResponse {
  items: StudentTestSummary[]
  total: number
  page: number
  page_size: number
}

export interface TestSubmitPayload {
  user_answers: Record<string, TestAnswerValue>
}

export interface QuestionResult {
  question_id: string
  question_type: QuestionType | string
  user_answer?: TestAnswerValue | null
  correct_answer?: TestAnswerValue | null
  is_correct?: boolean
  score: number
  max_score: number
  analysis?: string | null
  knowledge_points?: string[]
  grading_basis?: string | null
  knowledge_evidence?: Array<{
    document_id?: number | null
    chunk_id?: number | string | null
    source_filename?: string | null
    excerpt?: string | null
  }>
}

export interface TestSubmitResponse {
  test_id: number
  status: StudentTestStatus
  score: number
  analysis?: string | null
  feedback?: string | null
  question_results: QuestionResult[]
  answers?: Record<string, unknown>
  assessment_id?: number | null
  quality_analysis?: QualityAnalysis | null
}

export interface TestQuery {
  page?: number
  page_size?: number
  status?: StudentTestStatus | ''
  topic?: string
  difficulty?: StudentTestDifficulty | ''
}
