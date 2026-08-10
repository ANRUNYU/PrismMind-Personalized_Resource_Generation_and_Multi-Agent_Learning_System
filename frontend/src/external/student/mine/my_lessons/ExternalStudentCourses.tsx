import { useEffect, useMemo, useState } from 'react'

import { listCourseAssignments } from '@/api/courseAssignments'
import { getCourse, getMyCourses, joinCourse } from '@/api/courses'
import type { CourseAssignmentListItem } from '@/types/courseAssignment'
import type { Course } from '@/types/course'

import CardSystem from './components/CardSystem'
import DetailPanel from './components/DetailPanel'
import SceneLayer from './components/SceneLayer'
import TopNav from './components/TopNav'
import type { LessonCardModel, LessonNotice } from './types'
import './my-lessons.css'

const accentPalette = ['#8fd8df', '#b8c7ff', '#95ddb8', '#ffd189', '#f5b0c8', '#94cbd3']

interface CourseLearningMeta {
  assignmentTotal: number
  assignmentCompleted: number
  assignmentPublished: number
  progressPercent: number | null
  progressLabel: string
  progressCaption: string
}

const syncingLearningMeta: CourseLearningMeta = {
  assignmentTotal: 0,
  assignmentCompleted: 0,
  assignmentPublished: 0,
  progressPercent: null,
  progressLabel: '任务同步中',
  progressCaption: '正在读取课程任务'
}

const unavailableLearningMeta: CourseLearningMeta = {
  assignmentTotal: 0,
  assignmentCompleted: 0,
  assignmentPublished: 0,
  progressPercent: null,
  progressLabel: '任务待刷新',
  progressCaption: '稍后刷新查看任务状态'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function statusText(course: Course) {
  if (course.status === 'archived') return '已归档'
  if (course.current_user_role === 'student') return '学习中'
  if (course.current_user_role === 'teacher') return '授课中'
  if (course.current_user_role === 'admin') return '管理中'
  return '可学习'
}

function isCompletedAssignment(assignment: CourseAssignmentListItem) {
  return ['submitted', 'graded'].includes(String(assignment.current_student_submission_status || ''))
}

function buildLearningMeta(assignments: CourseAssignmentListItem[] | null): CourseLearningMeta {
  if (!assignments) {
    return unavailableLearningMeta
  }

  const assignmentTotal = assignments.length
  if (assignmentTotal === 0) {
    return {
      assignmentTotal: 0,
      assignmentCompleted: 0,
      assignmentPublished: 0,
      progressPercent: null,
      progressLabel: '暂无任务',
      progressCaption: '等待教师发布课程任务'
    }
  }

  const assignmentCompleted = assignments.filter(isCompletedAssignment).length
  const progressPercent = Math.round((assignmentCompleted / assignmentTotal) * 100)
  return {
    assignmentTotal,
    assignmentCompleted,
    assignmentPublished: assignmentTotal,
    progressPercent,
    progressLabel: `已完成 ${assignmentCompleted}/${assignmentTotal}`,
    progressCaption: `${assignmentTotal} 项已发布课程任务`
  }
}

async function loadLearningMeta(courseId: number): Promise<CourseLearningMeta> {
  try {
    const response = await listCourseAssignments(courseId, { page: 1, page_size: 100 })
    return buildLearningMeta(response.items)
  } catch {
    return unavailableLearningMeta
  }
}

async function loadLearningMetaMap(courses: Course[]) {
  const entries = await Promise.all(courses.map(async (course) => [course.id, await loadLearningMeta(course.id)] as const))
  return new Map(entries)
}

function toLessonCard(course: Course, index: number, learningMeta: CourseLearningMeta = syncingLearningMeta): LessonCardModel {
  const code = course.code || course.invite_code || ''
  const roleText =
    course.current_user_role === 'teacher'
      ? '授课成员'
      : course.current_user_role === 'admin'
        ? '管理成员'
        : course.current_user_role === 'student'
          ? '已加入'
          : '课程成员'
  const tags = [code ? `课程码 ${code}` : '课程码待同步', roleText, course.status === 'archived' ? '归档课程' : '进行中']
  return {
    id: course.id,
    title: course.name,
    teacher: course.teacher_name || '课程教师',
    department: '棱镜智教课程空间',
    status: statusText(course),
    progressPercent: learningMeta.progressPercent,
    progressLabel: learningMeta.progressLabel,
    progressCaption: learningMeta.progressCaption,
    updatedAt: formatDate(course.updated_at || course.created_at),
    tags,
    summary: course.description || '暂未填写课程简介，可进入学习空间查看课程资源、作业测试和学习安排。',
    assignmentTotal: learningMeta.assignmentTotal,
    assignmentCompleted: learningMeta.assignmentCompleted,
    assignmentPublished: learningMeta.assignmentPublished,
    accent: accentPalette[index % accentPalette.length],
    code,
    studentCount: course.student_count,
    role: course.current_user_role || 'student',
    raw: course
  }
}

function normalizeJoinCode(value: string) {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

function productErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : ''
  if (!message || /后端|接口|API|api|mock|fallback/i.test(message)) return fallback
  return message
}

export default function ExternalStudentCourses() {
  const [courses, setCourses] = useState<LessonCardModel[]>([])
  const [selectedCourse, setSelectedCourse] = useState<LessonCardModel | null>(null)
  const [query, setQuery] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [notice, setNotice] = useState<LessonNotice | null>(null)
  const [total, setTotal] = useState(0)

  async function openCourse(course: LessonCardModel) {
    setSelectedCourse(course)
    setDetailLoading(true)
    setNotice(null)
    try {
      const [detail, learningMeta] = await Promise.all([getCourse(course.id), loadLearningMeta(course.id)])
      const detailIndex = Math.max(0, courses.findIndex((item) => item.id === course.id))
      const detailCard = toLessonCard(detail, detailIndex, learningMeta)
      setSelectedCourse(detailCard)
      setCourses((items) => items.map((item) => (item.id === detailCard.id ? detailCard : item)))
    } catch (error) {
      setNotice({ type: 'error', message: productErrorMessage(error, '课程详情加载失败，请稍后重试。') })
    } finally {
      setDetailLoading(false)
    }
  }

  async function loadCourses(preferredId?: number, options?: { keepNotice?: boolean }) {
    setLoading(true)
    if (!options?.keepNotice) {
      setNotice(null)
    }
    try {
      const response = await getMyCourses({ page: 1, page_size: 100 })
      const learningMetaMap = await loadLearningMetaMap(response.items)
      const nextCourses = response.items.map((item, index) => toLessonCard(item, index, learningMetaMap.get(item.id)))
      setCourses(nextCourses)
      setTotal(response.total)

      const nextSelected =
        (preferredId ? nextCourses.find((item) => item.id === preferredId) : null) ||
        (selectedCourse ? nextCourses.find((item) => item.id === selectedCourse.id) : null) ||
        nextCourses[0] ||
        null
      setSelectedCourse(nextSelected)
      if (nextSelected) {
        void openCourse(nextSelected)
      }
    } catch (error) {
      setCourses([])
      setSelectedCourse(null)
      setNotice({ type: 'error', message: productErrorMessage(error, '课程列表加载失败，请确认登录状态后重试。') })
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinCourse() {
    const code = normalizeJoinCode(joinCode || query)
    if (!code) {
      setNotice({ type: 'info', message: '请输入老师提供的课程码后再加入课程。' })
      return
    }

    setJoining(true)
    setNotice(null)
    try {
      const response = await joinCourse({ code })
      setJoinCode('')
      setQuery('')
      await loadCourses(response.course.id, { keepNotice: true })
      setNotice({
        type: 'success',
        message: response.already_joined ? '你已加入该课程，列表已刷新。' : '课程加入成功，已刷新我的课程。'
      })
    } catch (error) {
      setNotice({ type: 'error', message: productErrorMessage(error, '加入课程失败，请检查课程码是否正确。') })
    } finally {
      setJoining(false)
    }
  }

  function enterCourse(course: LessonCardModel) {
    window.location.assign(`/student/courses/${course.id}`)
  }

  useEffect(() => {
    void loadCourses()
  }, [])

  const filteredCourses = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return courses
    return courses.filter((course) =>
      [
        course.title,
        course.teacher,
        course.department,
        course.status,
        course.code,
        course.progressLabel,
        course.progressCaption,
        ...(course.tags || [])
      ].some((item) => String(item || '').toLowerCase().includes(keyword))
    )
  }, [courses, query])

  const stats = useMemo(
    () => ({
      total: total || courses.length,
      learning: courses.filter((course) => course.status === '学习中').length,
      tasks: courses.reduce((sum, course) => sum + course.assignmentTotal, 0),
      completed: courses.reduce((sum, course) => sum + course.assignmentCompleted, 0)
    }),
    [courses, total]
  )

  return (
    <main className="mine-lessons-page" data-testid="external-student-courses">
      <TopNav />
      <section className="page-grid">
        <div className="workspace-column">
          <header className="page-hero">
            <div>
              <h1>我的课程</h1>
              <span>My Courses</span>
              <p>管理、探索与学习你的全部课程内容。</p>
            </div>
            <div className="toolbar-row">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  placeholder="搜索课程名称 / 教师 / 课程码"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className="join-code-box">
                <span>课程码</span>
                <input value={joinCode} placeholder="例如：PM-AB12CD" onChange={(event) => setJoinCode(event.target.value)} />
              </label>
              <button className="add-button" type="button" disabled={joining} onClick={() => void handleJoinCourse()}>
                {joining ? '加入中...' : '加入课程'}
              </button>
              <button className="add-button add-button--subtle" type="button" disabled={loading} onClick={() => void loadCourses(selectedCourse?.id)}>
                刷新
              </button>
            </div>
            {notice ? <div className={`lesson-action-notice is-${notice.type}`}>{notice.message}</div> : null}
          </header>

          <SceneLayer>
            {loading ? (
              <div className="lesson-empty-state" data-testid="external-loading">
                正在加载我的课程...
              </div>
            ) : (
              <CardSystem
                courses={filteredCourses}
                emptyText={query.trim() ? '没有匹配的课程，请调整关键词或清空搜索。' : undefined}
                selectedId={selectedCourse?.id}
                onSelect={(course) => void openCourse(course)}
              />
            )}
          </SceneLayer>
        </div>

        <aside className="side-column">
          <div className="stats-panel">
            <span>
              <strong>{stats.total}</strong>
              课程总数
            </span>
            <span>
              <strong>{stats.learning}</strong>
              学习中
            </span>
            <span>
              <strong>{stats.tasks}</strong>
              已发布任务
            </span>
            <span>
              <strong>{stats.completed}</strong>
              已完成任务
            </span>
          </div>
          <DetailPanel
            course={selectedCourse}
            joining={joining}
            loading={loading || detailLoading}
            notice={notice}
            onEnter={enterCourse}
            onJoin={() => void handleJoinCourse()}
            onRefresh={() => void loadCourses(selectedCourse?.id)}
          />
        </aside>
      </section>
    </main>
  )
}
