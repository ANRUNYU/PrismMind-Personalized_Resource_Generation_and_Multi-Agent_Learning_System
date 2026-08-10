import { defineStore } from 'pinia'

import {
  advanceLearningPath,
  createLearningPath,
  generateStepQuiz,
  getLearningPath,
  getLearningPathRecommendation,
  getLearningPaths,
  type LearningPath,
  type LearningPathAdvanceRequest,
  type LearningPathCreateRequest,
  type LearningPathListResponse,
  type LearningPathQuizRequest,
  type LearningPathQuizResponse,
  type LearningPathRecommendation,
  type LearningPathStatus
} from '@/api/learningPaths'

export const useLearningPathsStore = defineStore('learningPaths', {
  state: () => ({
    paths: [] as LearningPath[],
    total: 0,
    currentPath: null as LearningPath | null,
    recommendations: [] as LearningPathRecommendation[],
    loading: false,
    creating: false,
    detailLoading: false,
    quizLoading: false
  }),
  actions: {
    async createPath(payload: LearningPathCreateRequest) {
      this.creating = true
      try {
        const path = await createLearningPath(payload)
        this.currentPath = path
        await this.fetchPaths()
        return path
      } finally {
        this.creating = false
      }
    },
    async fetchPaths(params?: { page?: number; page_size?: number; status?: LearningPathStatus | ''; topic?: string }) {
      this.loading = true
      try {
        const data: LearningPathListResponse = await getLearningPaths(params)
        this.paths = data.items
        this.total = data.total
        return data
      } finally {
        this.loading = false
      }
    },
    async fetchPath(pathId: number) {
      this.detailLoading = true
      try {
        this.currentPath = await getLearningPath(pathId)
        return this.currentPath
      } finally {
        this.detailLoading = false
      }
    },
    async advancePath(pathId: number, payload: LearningPathAdvanceRequest) {
      const result = await advanceLearningPath(pathId, payload)
      await this.fetchPath(pathId)
      await this.fetchPaths()
      return result
    },
    async generateQuiz(pathId: number, payload: LearningPathQuizRequest): Promise<LearningPathQuizResponse> {
      this.quizLoading = true
      try {
        return await generateStepQuiz(pathId, payload)
      } finally {
        this.quizLoading = false
      }
    },
    async fetchRecommendations() {
      const data = await getLearningPathRecommendation()
      this.recommendations = data.recommendations
      return this.recommendations
    }
  }
})
