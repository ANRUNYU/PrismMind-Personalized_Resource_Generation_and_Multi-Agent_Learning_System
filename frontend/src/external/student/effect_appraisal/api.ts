import type {
  AssessmentCreatePayload,
  AssessmentItem,
  AssessmentListResponse,
  AssessmentSummary,
  AssessmentRecommendationResponse,
  AssessmentSubmitPayload,
} from '@/types/assessment'
import {
  createAssessment,
  getAssessmentDetail,
  getAssessmentRecommendations,
  getAssessmentSummary,
  getAssessments,
  submitAssessmentDetail,
} from '@/api/assessments'
import { generateStudentTest } from '@/api/tests'

export type { AssessmentCreatePayload, AssessmentItem, AssessmentSubmitPayload, AssessmentSummary } from '@/types/assessment'

function delay(ms: number = 420) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export async function generateAssessment(payload: {
  topic: string
  difficulty: string
  questionCount: string
}): Promise<{ testId: number }> {
  const difficultyMap = { 简单: 'easy', 中等: 'medium', 困难: 'hard' } as const
  const result = await generateStudentTest({
    topic: payload.topic,
    difficulty: difficultyMap[payload.difficulty as keyof typeof difficultyMap] || 'medium',
    question_count: Number(payload.questionCount),
    question_types: ['single_choice', 'multiple_choice', 'true_false', 'short_answer'],
    knowledge_points: [],
    file_ids: [],
    knowledge_document_ids: [],
    use_knowledge_base: false,
    use_question_bank: true,
    top_k: 5,
  })
  return { testId: result.test_id }
}

export async function fetchAssessmentRecords(): Promise<{ items: AssessmentItem[] }> {
  await delay(240)
  const response = await getAssessments({ page: 1, page_size: 50 })
  return { items: response.items }
}

export async function fetchAssessmentDetail(recordId: number): Promise<AssessmentItem | null> {
  return getAssessmentDetail(recordId)
}

export async function submitAssessment(recordId: number, payload: AssessmentSubmitPayload): Promise<AssessmentItem> {
  return submitAssessmentDetail(recordId, payload)
}

export async function getAssessmentResult(recordId: number): Promise<{
  score: number | null
  level: string
  advice: string
} | null> {
  await delay(260)
  const detail = await fetchAssessmentDetail(recordId)
  if (!detail) return null
  const score = detail.score ?? null
  let level = '待评估'
  if (score !== null) {
    if (score >= 90) level = '优秀'
    else if (score >= 80) level = '良好'
    else if (score >= 70) level = '中等'
    else if (score >= 60) level = '及格'
    else level = '需加强'
  }
  const advice =
    detail.analysis ||
    detail.recommendations?.map((r) => r.suggested_action || r.title).filter(Boolean).join('；') ||
    '请继续学习，完成更多评估以获取个性化建议。'
  return { score, level, advice }
}

export async function loadAssessmentSummary(): Promise<AssessmentSummary | null> {
  try {
    return await getAssessmentSummary()
  } catch {
    return null
  }
}

export async function loadAssessmentRecommendations(topK = 5): Promise<AssessmentRecommendationResponse> {
  return getAssessmentRecommendations({ top_k: topK })
}
