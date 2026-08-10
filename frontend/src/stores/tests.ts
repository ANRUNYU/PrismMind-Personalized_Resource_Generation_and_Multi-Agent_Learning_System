import { defineStore } from 'pinia'

import {
  generateStudentTest,
  getStudentTest,
  getStudentTests,
  startStudentTest,
  submitStudentTest
} from '@/api/tests'
import type {
  StudentTestSummary,
  TestDetail,
  TestGeneratePayload,
  TestGenerateResponse,
  TestListResponse,
  TestQuery,
  TestSubmitPayload,
  TestSubmitResponse
} from '@/types/test'

export const useTestsStore = defineStore('student-tests', {
  state: () => ({
    tests: [] as StudentTestSummary[],
    currentTest: null as TestDetail | null,
    lastGenerated: null as TestGenerateResponse | null,
    lastSubmitResult: null as TestSubmitResponse | null,
    total: 0,
    loading: false,
    detailLoading: false,
    generating: false,
    starting: false,
    submitting: false
  }),
  actions: {
    async generateTest(payload: TestGeneratePayload) {
      this.generating = true
      try {
        const data = await generateStudentTest(payload)
        this.lastGenerated = data
        await this.fetchTests()
        return data
      } finally {
        this.generating = false
      }
    },
    async fetchTests(params?: TestQuery) {
      this.loading = true
      try {
        const data: TestListResponse = await getStudentTests(params)
        this.tests = data.items
        this.total = data.total
        return data
      } finally {
        this.loading = false
      }
    },
    async fetchTest(testId: number | string) {
      this.detailLoading = true
      try {
        this.currentTest = await getStudentTest(testId)
        return this.currentTest
      } finally {
        this.detailLoading = false
      }
    },
    async startTest(testId: number | string) {
      this.starting = true
      try {
        this.currentTest = await startStudentTest(testId)
        await this.fetchTests()
        return this.currentTest
      } finally {
        this.starting = false
      }
    },
    async submitTest(testId: number | string, payload: TestSubmitPayload) {
      this.submitting = true
      try {
        const data = await submitStudentTest(testId, payload)
        await Promise.all([this.fetchTest(testId), this.fetchTests()])
        this.lastSubmitResult = data
        return data
      } finally {
        this.submitting = false
      }
    }
  }
})
