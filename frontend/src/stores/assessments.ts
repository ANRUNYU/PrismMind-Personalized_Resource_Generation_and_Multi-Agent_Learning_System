import { defineStore } from 'pinia'

import {
  createAssessment,
  getAssessmentRecommendations,
  getAssessments,
  getAssessmentSummary
} from '@/api/assessments'
import type {
  AssessmentCreatePayload,
  AssessmentItem,
  AssessmentListResponse,
  AssessmentQuery,
  AssessmentRecommendation,
  AssessmentRecommendationResponse,
  AssessmentSummary
} from '@/types/assessment'

export const useAssessmentsStore = defineStore('assessments', {
  state: () => ({
    assessments: [] as AssessmentItem[],
    summary: null as AssessmentSummary | null,
    recommendations: [] as AssessmentRecommendation[],
    total: 0,
    loading: false,
    summaryLoading: false,
    recommendationLoading: false,
    creating: false
  }),
  actions: {
    async fetchAssessments(params?: AssessmentQuery) {
      this.loading = true
      try {
        const data: AssessmentListResponse = await getAssessments(params)
        this.assessments = data.items
        this.total = data.total
        return data
      } finally {
        this.loading = false
      }
    },
    async fetchSummary() {
      this.summaryLoading = true
      try {
        this.summary = await getAssessmentSummary()
        return this.summary
      } finally {
        this.summaryLoading = false
      }
    },
    async fetchRecommendations(params?: { topic?: string; top_k?: number }) {
      this.recommendationLoading = true
      try {
        const data: AssessmentRecommendationResponse = await getAssessmentRecommendations(params)
        this.recommendations = data.recommendations || []
        return data
      } finally {
        this.recommendationLoading = false
      }
    },
    async createAssessment(payload: AssessmentCreatePayload) {
      this.creating = true
      try {
        const data = await createAssessment(payload)
        await Promise.all([this.fetchAssessments(), this.fetchSummary(), this.fetchRecommendations()])
        return data
      } finally {
        this.creating = false
      }
    }
  }
})
