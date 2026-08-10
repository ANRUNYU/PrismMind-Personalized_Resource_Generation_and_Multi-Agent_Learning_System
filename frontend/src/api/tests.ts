import request from './request'
import type {
  TestDetail,
  TestGeneratePayload,
  TestGenerateResponse,
  TestListResponse,
  TestQuery,
  TestSubmitPayload,
  TestSubmitResponse
} from '@/types/test'
import type { TaskCreateResponse } from '@/types/task'

export type {
  QuestionResult,
  QuestionType,
  StudentTestDifficulty,
  StudentTestStatus,
  StudentTestSummary,
  TestAnswerValue,
  TestDetail,
  TestGeneratePayload,
  TestGenerateResponse,
  TestListResponse,
  TestQuery,
  TestQuestion,
  TestQuestionOption,
  TestSubmitPayload,
  TestSubmitResponse
} from '@/types/test'

export function generateStudentTest(payload: TestGeneratePayload) {
  return request.post<TestGenerateResponse, TestGenerateResponse>('/student/tests/generate', payload, { timeout: 180000 })
}

export function generateStudentTestAsync(payload: TestGeneratePayload) {
  return request.post<TaskCreateResponse, TaskCreateResponse>('/student/tests/generate-async', payload)
}

export function startStudentTest(testId: number | string) {
  return request.post<TestDetail, TestDetail>(`/student/tests/${testId}/start`)
}

export function submitStudentTest(testId: number | string, payload: TestSubmitPayload) {
  return request.post<TestSubmitResponse, TestSubmitResponse>(`/student/tests/${testId}/submit`, payload)
}

export function getStudentTests(params?: TestQuery) {
  return request.get<TestListResponse, TestListResponse>('/student/tests', { params })
}

export function getStudentTest(testId: number | string) {
  return request.get<TestDetail, TestDetail>(`/student/tests/${testId}`)
}
