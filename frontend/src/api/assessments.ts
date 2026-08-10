import request from './request'
import type {
  AssessmentCreatePayload,
  AssessmentItem,
  AssessmentListResponse,
  AssessmentQuery,
  AssessmentRecommendationResponse,
  AssessmentSubmitPayload,
  AssessmentSummary
} from '@/types/assessment'

export type {
  AssessmentCreatePayload,
  AssessmentItem,
  AssessmentListResponse,
  AssessmentQuery,
  AssessmentRecommendation,
  AssessmentRecommendationResponse,
  AssessmentSubmitPayload,
  AssessmentSummary,
  AssessmentType
} from '@/types/assessment'

export function createAssessment(payload: AssessmentCreatePayload) {
  return request.post<AssessmentItem, AssessmentItem>('/student/assessments', payload)
}

export function getAssessments(params?: AssessmentQuery) {
  return request.get<AssessmentListResponse, AssessmentListResponse>('/student/assessments', { params })
}

export function getAssessmentDetail(id: number) {
  return request.get<AssessmentItem, AssessmentItem>(`/student/assessments/${id}`)
}

export function submitAssessmentDetail(id: number, payload: AssessmentSubmitPayload) {
  return request.post<AssessmentItem, AssessmentItem>(`/student/assessments/${id}/submit`, payload)
}

export function getAssessmentSummary() {
  return request.get<AssessmentSummary, AssessmentSummary>('/student/assessments/summary')
}

export function getAssessmentRecommendations(params?: { topic?: string; top_k?: number }) {
  return request.get<AssessmentRecommendationResponse, AssessmentRecommendationResponse>(
    '/student/assessments/recommendations',
    { params }
  )
}
