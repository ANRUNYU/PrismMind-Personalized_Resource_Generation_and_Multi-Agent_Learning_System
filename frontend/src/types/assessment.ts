import type { QualityAnalysis } from './qualityAnalysis'

export type AssessmentType = 'resource' | 'path' | 'topic' | 'test' | 'comprehensive'
export type RecommendationPriority = 'high' | 'medium' | 'low' | string

export interface AssessmentRecommendation {
  title: string
  description?: string
  priority?: RecommendationPriority
  reason?: string
  suggested_action?: string
  related_topics?: string[]
}

export interface AssessmentCreatePayload {
  assessment_type: AssessmentType
  topic?: string | null
  resource_id?: number | null
  path_id?: number | null
  test_id?: number | null
  score?: number | null
  correct_topics?: string[]
  incorrect_topics?: string[]
  learning_evidence?: Record<string, unknown>
}

export interface AssessmentSubmitPayload {
  answers?: Record<string, unknown>
  reflection?: string | null
  self_rating?: number | null
  feedback?: string | null
}

export interface AssessmentItem {
  id: number
  assessment_id?: number | null
  title?: string | null
  assessment_type: AssessmentType
  target_type?: string | null
  target_id?: number | null
  topic?: string | null
  resource_id?: number | null
  path_id?: number | null
  test_id?: number | null
  score?: number | null
  level?: string | null
  summary?: string | null
  strengths?: string[]
  weaknesses?: string[]
  weak_topics?: string[]
  correct_topics: string[]
  incorrect_topics: string[]
  analysis?: string | null
  recommendations: AssessmentRecommendation[]
  answers?: Record<string, unknown>
  reflection?: string | null
  self_rating?: number | null
  feedback?: string | null
  quality_analysis?: QualityAnalysis | null
  created_at: string
  updated_at?: string | null
  submitted_at?: string | null
}

export interface AssessmentListResponse {
  items: AssessmentItem[]
  total: number
  page: number
  page_size: number
}

export interface AssessmentTrendPoint {
  assessment_id: number
  score?: number | null
  created_at: string
}

export interface AssessmentSummary {
  total_assessments: number
  average_score: number
  latest_score?: number | null
  score_trend: AssessmentTrendPoint[]
  strong_topics: string[]
  weak_topics: string[]
  assessment_type_distribution: Record<string, number>
  recent_recommendations: AssessmentRecommendation[]
  profile_dimension_hints: Record<string, number>
}

export interface AssessmentRecommendationResponse {
  recommendations: AssessmentRecommendation[]
  basis: Record<string, unknown>
}

export interface AssessmentQuery {
  page?: number
  page_size?: number
  assessment_type?: AssessmentType | ''
  topic?: string
  min_score?: number | null
  max_score?: number | null
}
