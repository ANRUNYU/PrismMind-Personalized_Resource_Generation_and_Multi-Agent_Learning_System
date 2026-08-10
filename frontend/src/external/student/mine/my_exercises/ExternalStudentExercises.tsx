import { useEffect, useMemo, useState } from 'react'

import {
  completeStudentExercise,
  createStudentExercise,
  deleteStudentExercise,
  favoriteStudentExercise,
  getStudentExercise,
  listStudentExercises,
  startStudentExercise,
  submitStudentExercise
} from '@/api/studentExercises'
import type { StudentExerciseRead, StudentExerciseSubmitResponse, StudentExerciseSummary } from '@/types/studentExercise'
import type { TestAnswerValue, TestQuestion } from '@/types/test'
import { formatDateTime } from '@/utils/format'

import CardSystem from './CardSystem'
import DetailPanel from './DetailPanel'
import SceneLayer from './SceneLayer'
import TopNav from './TopNav'
import type { ExerciseActionNotice, ExerciseCardModel } from './types'
import './my-exercises.css'

function layoutHeight(seed: number) {
  return 218 + (seed % 4) * 28
}

function toExerciseCard(item: StudentExerciseSummary | StudentExerciseRead | ExerciseCardModel, index: number): ExerciseCardModel {
  const detail = 'questions' in item ? item : 'detail' in item ? item.detail || null : null
  return {
    ...item,
    card_id: item.id,
    course_name: item.course_name || (item.source === 'personal' ? '个人习题库' : '课程练习'),
    status_label: item.status_label || formatExerciseStatus(item.status),
    updated_label: formatDateTime(item.updated_at || item.created_at),
    due_label: formatDateTime(item.due_at),
    tags: item.tags || [],
    height: layoutHeight(index + Number(item.personal_id || item.assignment_id || index + 1)),
    detail
  }
}

function buildDefaultExercisePayload() {
  const suffix = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date())
  return {
    title: `个人巩固练习 ${suffix}`,
    description: '围绕近期学习内容完成一次简短复盘。',
    content: '请用自己的话说明一个最近需要巩固的知识点，并给出一个可以帮助理解的示例。',
    answer: '知识点 示例 应用',
    explanation: '建议从概念、示例和应用三个角度组织答案。',
    difficulty: 'medium',
    category: '个人习题',
    tags: ['个人练习', '巩固复盘'],
    total_score: 100
  }
}

export default function ExternalStudentExercises() {
  const [exercises, setExercises] = useState<ExerciseCardModel[]>([])
  const [selected, setSelected] = useState<ExerciseCardModel | null>(null)
  const [detail, setDetail] = useState<StudentExerciseRead | null>(null)
  const [answers, setAnswers] = useState<Record<string, TestAnswerValue>>({})
  const [submitResult, setSubmitResult] = useState<StudentExerciseSubmitResponse | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<ExerciseActionNotice | null>(null)

  const visibleExercises = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return exercises
    return exercises.filter((item) =>
      [
        item.title,
        item.course_name,
        item.category,
        item.difficulty,
        item.status_label,
        item.description,
        item.content,
        ...(item.tags || [])
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
    )
  }, [exercises, query])

  const stats = useMemo(() => {
    const scored = exercises.filter((item) => item.score !== null && item.score !== undefined)
    return {
      total: exercises.length,
      personal: exercises.filter((item) => item.source === 'personal').length,
      active: exercises.filter((item) => ['not_started', 'in_progress', 'published'].includes(String(item.status))).length,
      completed: exercises.filter((item) => ['submitted', 'graded', 'completed'].includes(String(item.status))).length,
      score: scored.length ? Math.round(scored.reduce((sum, item) => sum + Number(item.score || 0), 0) / scored.length) : null
    }
  }, [exercises])

  async function openExercise(exercise: ExerciseCardModel) {
    setSelected(exercise)
    setDetailLoading(true)
    setSubmitResult(null)
    setNotice(null)
    setError('')
    try {
      const nextDetail = await getStudentExercise(exercise.id)
      const nextCard = toExerciseCard(nextDetail, exercises.findIndex((item) => item.id === exercise.id))
      setDetail(nextDetail)
      setAnswers(nextDetail.user_answers || {})
      updateCurrentCard(nextCard)
      setSelected(nextCard)
    } catch (err) {
      setError(err instanceof Error ? err.message : '练习详情加载失败')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function loadExercises(preferredCardId?: string) {
    setLoading(true)
    setError('')
    setNotice(null)
    try {
      const response = await listStudentExercises({ page: 1, page_size: 100 })
      const nextExercises = response.items.map((item, index) => toExerciseCard(item, index))
      setExercises(nextExercises)
      const nextSelected =
        nextExercises.find((item) => item.card_id === preferredCardId) ||
        (selected ? nextExercises.find((item) => item.card_id === selected.card_id) : null) ||
        nextExercises[0] ||
        null

      if (nextSelected) {
        setSelected(nextSelected)
        setDetailLoading(true)
        const nextDetail = await getStudentExercise(nextSelected.id)
        const nextCard = toExerciseCard(nextDetail, nextExercises.findIndex((item) => item.id === nextSelected.id))
        setExercises(nextExercises.map((item) => (item.card_id === nextCard.card_id ? nextCard : item)))
        setDetail(nextDetail)
        setAnswers(nextDetail.user_answers || {})
        setSelected(nextCard)
        setDetailLoading(false)
      } else {
        setSelected(null)
        setDetail(null)
        setAnswers({})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '练习内容加载失败')
      setSelected(null)
      setDetail(null)
      setDetailLoading(false)
    } finally {
      setLoading(false)
    }
  }

  function updateCurrentCard(nextCard: ExerciseCardModel) {
    setExercises((items) => {
      const existingIndex = items.findIndex((item) => item.card_id === nextCard.card_id)
      if (existingIndex === -1) return [nextCard, ...items]
      return items.map((item) => (item.card_id === nextCard.card_id ? nextCard : item))
    })
  }

  async function handleCreateExercise() {
    setActionLoading(true)
    setError('')
    setNotice(null)
    try {
      const created = await createStudentExercise(buildDefaultExercisePayload())
      const nextCard = toExerciseCard(created, 0)
      setExercises((items) => [nextCard, ...items.filter((item) => item.card_id !== nextCard.card_id)])
      setDetail(created)
      setAnswers(created.user_answers || {})
      setSelected(nextCard)
      setNotice({ type: 'success', message: '已添加一条个人习题，可以立即开始作答。' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加习题失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function startSelected() {
    if (!selected) return
    setDetailLoading(true)
    setError('')
    setNotice(null)
    try {
      const response = await startStudentExercise(selected.id)
      const nextCard = toExerciseCard(response.exercise, exercises.findIndex((item) => item.id === selected.id))
      setDetail(response.exercise)
      setAnswers(response.exercise.user_answers || {})
      updateCurrentCard(nextCard)
      setSelected(nextCard)
      setNotice({ type: 'success', message: '已进入作答状态。' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '开始作答失败')
    } finally {
      setDetailLoading(false)
    }
  }

  async function submitSelected() {
    if (!selected) return
    setSubmitting(true)
    setError('')
    setNotice(null)
    try {
      const result = await submitStudentExercise(selected.id, { answers })
      const nextCard = toExerciseCard(result.exercise, exercises.findIndex((item) => item.id === selected.id))
      setSubmitResult(result)
      setDetail(result.exercise)
      setAnswers(result.exercise.user_answers || answers)
      updateCurrentCard(nextCard)
      setSelected(nextCard)
      setNotice({ type: 'success', message: '答案已提交，学习反馈已更新。' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交练习失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function favoriteSelected() {
    if (!selected || selected.source !== 'personal') return
    setActionLoading(true)
    setError('')
    setNotice(null)
    try {
      const updated = await favoriteStudentExercise(selected.id)
      const nextCard = toExerciseCard(updated, exercises.findIndex((item) => item.id === selected.id))
      setDetail(updated)
      updateCurrentCard(nextCard)
      setSelected(nextCard)
      setNotice({ type: 'success', message: updated.is_favorite ? '已收藏这道习题。' : '已取消收藏。' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '收藏操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function completeSelected() {
    if (!selected || selected.source !== 'personal') return
    setActionLoading(true)
    setError('')
    setNotice(null)
    try {
      const updated = await completeStudentExercise(selected.id)
      const nextCard = toExerciseCard(updated, exercises.findIndex((item) => item.id === selected.id))
      setDetail(updated)
      updateCurrentCard(nextCard)
      setSelected(nextCard)
      setNotice({ type: 'success', message: '已标记为完成。' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '标记完成失败')
    } finally {
      setActionLoading(false)
    }
  }

  async function deleteSelected() {
    if (!selected || selected.source !== 'personal') return
    setActionLoading(true)
    setError('')
    setNotice(null)
    try {
      await deleteStudentExercise(selected.id)
      const remaining = exercises.filter((item) => item.card_id !== selected.card_id)
      setExercises(remaining)
      setNotice({ type: 'success', message: '习题已删除。' })
      const nextSelected = remaining[0] || null
      if (nextSelected) {
        await openExercise(nextSelected)
      } else {
        setSelected(null)
        setDetail(null)
        setAnswers({})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除习题失败')
    } finally {
      setActionLoading(false)
    }
  }

  function updateAnswer(question: TestQuestion, value: TestAnswerValue) {
    setAnswers((current) => ({ ...current, [question.id]: value }))
  }

  useEffect(() => {
    void loadExercises()
  }, [])

  return (
    <main className="mine-exercises-page" data-testid="external-student-exercises">
      <TopNav />
      <section className="page-grid">
        <div className="workspace-column">
          <header className="page-hero">
            <div>
              <h1>我的习题</h1>
              <span>My Exercises</span>
              <p>管理、练习与巩固你的个性化习题库，智能追踪学习进度。</p>
            </div>
            <div className="toolbar-row">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input value={query} placeholder="搜索知识点 / 题目名称 / 关键词" onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button className="add-button" disabled={actionLoading} type="button" onClick={() => void handleCreateExercise()}>
                + 添加习题
              </button>
              <button className="add-button add-button--subtle" type="button" onClick={() => void loadExercises(selected?.card_id)}>
                刷新
              </button>
            </div>
            {error ? <div className="exercise-error">{error}</div> : null}
          </header>

          <div className="exercise-summary-row">
            <span>
              <strong>{stats.total}</strong>
              练习总数
            </span>
            <span>
              <strong>{stats.personal}</strong>
              个人习题
            </span>
            <span>
              <strong>{stats.active}</strong>
              待完成
            </span>
            <span>
              <strong>{stats.completed}</strong>
              已完成
            </span>
            <span>
              <strong>{stats.score ?? '-'}</strong>
              平均分
            </span>
          </div>

          <SceneLayer>
            {loading ? (
              <div className="exercise-empty-state" data-testid="external-loading">
                正在整理你的练习内容...
              </div>
            ) : visibleExercises.length ? (
              <CardSystem exercises={visibleExercises} selectedId={selected?.card_id} onSelect={openExercise} />
            ) : (
              <div className="exercise-empty-state">
                暂无可练习内容。你可以添加个人习题，或等待课程老师发布练习任务。
              </div>
            )}
          </SceneLayer>
        </div>

        <DetailPanel
          answers={answers}
          detail={detail}
          exercise={selected}
          loading={detailLoading}
          notice={notice}
          submitResult={submitResult}
          submitting={submitting}
          working={actionLoading}
          onAnswerChange={updateAnswer}
          onComplete={completeSelected}
          onDelete={deleteSelected}
          onFavorite={favoriteSelected}
          onStart={startSelected}
          onSubmit={submitSelected}
        />
      </section>
    </main>
  )
}

function formatExerciseStatus(value?: string | null) {
  const labels: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    submitted: '已提交',
    graded: '已评分',
    completed: '已完成',
    published: '待练习',
    closed: '已结束'
  }
  return value ? labels[value] || value : '-'
}
