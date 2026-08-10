import type { StudentTestSummary, TestDetail, TestSubmitResponse } from '@/types/test'

export interface TestCardModel {
  id: number
  title: string
  course: string
  updatedAt: string
  creator: string
  source: string
  questionCount: number
  totalScore: number
  duration: number
  difficulty: string
  favorite: boolean
  summary: string
  sections: Array<{ name: string; ratio: number; count: number }>
  accent: string
  status: string
  score?: number | null
  raw: StudentTestSummary
}

export interface TestDetailState {
  card: TestCardModel
  detail: TestDetail
  submitResult: TestSubmitResponse | null
}
