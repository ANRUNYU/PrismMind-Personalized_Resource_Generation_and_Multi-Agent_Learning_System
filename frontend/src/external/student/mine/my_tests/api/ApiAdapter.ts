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
  TestQuery,
  TestSubmitPayload
} from '@/types/test'

import type { TestCardModel } from '../types'

const accentPalette = ['#9cd7dc', '#b7c8ff', '#efbfd0', '#f4d38d', '#98d6b2', '#b5e2d6']

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function difficultyText(value?: string | null) {
  const map: Record<string, string> = {
    easy: '基础',
    medium: '中等',
    hard: '困难',
    mixed: '混合'
  }
  return value ? map[value] || value : '中等'
}

function statusText(value?: string | null) {
  const map: Record<string, string> = {
    generated: '待开始',
    in_progress: '作答中',
    submitted: '已提交',
    cancelled: '已取消'
  }
  return value ? map[value] || value : '待开始'
}

function questionTypeText(value: string) {
  const map: Record<string, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    true_false: '判断题',
    short_answer: '简答题'
  }
  return map[value] || value
}

function buildSections(detail?: TestDetail | null, questionCount = 0) {
  if (!detail?.questions?.length) {
    return [{ name: '综合题组', ratio: 100, count: questionCount }]
  }

  const counts = detail.questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.question_type] = (acc[question.question_type] || 0) + 1
    return acc
  }, {})
  const total = detail.questions.length || 1
  return Object.entries(counts).map(([type, count]) => ({
    name: questionTypeText(type),
    ratio: Math.max(12, Math.round((count / total) * 100)),
    count
  }))
}

function sumScore(summary: StudentTestSummary, detail?: TestDetail | null) {
  if (!detail?.questions?.length) return Math.round(Number(summary.total_score || 0))
  return Math.round(detail.questions.reduce((sum, question) => sum + (question.score || 0), 0))
}

export function toCard(summary: StudentTestSummary, index: number, detail?: TestDetail | null): TestCardModel {
  const questionCount = detail?.questions?.length || summary.question_count || 0
  return {
    id: summary.id,
    title: summary.topic || `测试 #${summary.id}`,
    course: '学生自测',
    updatedAt: formatDate(summary.submitted_at || summary.started_at || summary.created_at),
    creator: '棱镜智教-PrismMind',
    source: 'AI 生成测验',
    questionCount,
    totalScore: sumScore(summary, detail),
    duration: Math.max(15, questionCount * 4),
    difficulty: difficultyText(summary.difficulty),
    favorite: summary.status === 'submitted',
    summary: `${statusText(summary.status)} · ${difficultyText(summary.difficulty)} · ${questionCount} 题`,
    sections: buildSections(detail, questionCount),
    accent: accentPalette[index % accentPalette.length],
    status: summary.status,
    score: summary.score,
    raw: summary
  }
}

export const ApiAdapter = {
  getTests(params?: TestQuery) {
    return getStudentTests(params)
  },
  getTest(testId: number | string) {
    return getStudentTest(testId)
  },
  generateTest(payload: TestGeneratePayload) {
    return generateStudentTest(payload)
  },
  startTest(testId: number | string) {
    return startStudentTest(testId)
  },
  submitTest(testId: number | string, payload: TestSubmitPayload) {
    return submitStudentTest(testId, payload)
  }
}
