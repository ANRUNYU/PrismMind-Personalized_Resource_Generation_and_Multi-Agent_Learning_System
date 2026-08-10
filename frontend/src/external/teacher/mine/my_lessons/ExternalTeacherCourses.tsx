import { useEffect, useMemo, useState } from 'react'

import { listCourseAssignments } from '@/api/courseAssignments'
import { archiveCourse, createCourse, getCourse, getMyCourses } from '@/api/courses'
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

const syncingTeachingMeta: CourseLearningMeta = {
  assignmentTotal: 0,
  assignmentCompleted: 0,
  assignmentPublished: 0,
  progressPercent: null,
  progressLabel: '任务同步中',
  progressCaption: '正在读取课程任务'
}

const unavailableTeachingMeta: CourseLearningMeta = {
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
  if (course.current_user_role === 'teacher') return '授课中'
  if (course.current_user_role === 'admin') return '管理中'
  return '授课中'
}

function isPublishedAssignment(assignment: CourseAssignmentListItem) {
  return ['published', 'closed'].includes(String(assignment.status || ''))
}

function buildTeachingMeta(assignments: CourseAssignmentListItem[] | null): CourseLearningMeta {
  if (!assignments) {
    return unavailableTeachingMeta
  }

  const assignmentTotal = assignments.length
  if (assignmentTotal === 0) {
    return {
      assignmentTotal: 0,
      assignmentCompleted: 0,
      assignmentPublished: 0,
      progressPercent: null,
      progressLabel: '暂无任务',
      progressCaption: '可在课程管理中发布任务'
    }
  }

  const assignmentPublished = assignments.filter(isPublishedAssignment).length
  const assignmentCompleted = assignments.reduce((sum, assignment) => sum + Number(assignment.submitted_count || 0), 0)
  const progressPercent = Math.round((assignmentPublished / assignmentTotal) * 100)
  return {
    assignmentTotal,
    assignmentCompleted,
    assignmentPublished,
    progressPercent,
    progressLabel: `已发布 ${assignmentPublished}/${assignmentTotal}`,
    progressCaption: `${assignmentCompleted} 份学生提交记录`
  }
}

async function loadTeachingMeta(courseId: number): Promise<CourseLearningMeta> {
  try {
    const response = await listCourseAssignments(courseId, { page: 1, page_size: 100 })
    return buildTeachingMeta(response.items)
  } catch {
    return unavailableTeachingMeta
  }
}

async function loadTeachingMetaMap(courses: Course[]) {
  const entries = await Promise.all(courses.map(async (course) => [course.id, await loadTeachingMeta(course.id)] as const))
  return new Map(entries)
}

function toLessonCard(course: Course, index: number, teachingMeta: CourseLearningMeta = syncingTeachingMeta): LessonCardModel {
  const code = course.code || course.invite_code || ''
  const roleText =
    course.current_user_role === 'teacher'
      ? '授课成员'
      : course.current_user_role === 'admin'
        ? '管理成员'
        : '课程成员'
  const tags = [code ? `课程码 ${code}` : '课程码待同步', roleText, course.status === 'archived' ? '归档课程' : '进行中']
  return {
    id: course.id,
    title: course.name,
    teacher: course.teacher_name || '课程教师',
    department: '棱镜智教授课空间',
    status: statusText(course),
    progressPercent: teachingMeta.progressPercent,
    progressLabel: teachingMeta.progressLabel,
    progressCaption: teachingMeta.progressCaption,
    updatedAt: formatDate(course.updated_at || course.created_at),
    tags,
    summary: course.description || '暂未填写课程简介，可进入课程管理查看成员、任务和课程资料。',
    assignmentTotal: teachingMeta.assignmentTotal,
    assignmentCompleted: teachingMeta.assignmentCompleted,
    assignmentPublished: teachingMeta.assignmentPublished,
    accent: accentPalette[index % accentPalette.length],
    code,
    studentCount: course.student_count,
    role: course.current_user_role || 'teacher',
    raw: course
  }
}

function normalizeCourseName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function productErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : ''
  if (!message || /后端|接口|API|api|mock|fallback/i.test(message)) return fallback
  return message
}

export default function ExternalTeacherCourses() {
  const [courses, setCourses] = useState<LessonCardModel[]>([])
  const [selectedCourse, setSelectedCourse] = useState<LessonCardModel | null>(null)
  const [query, setQuery] = useState('')
  const [courseName, setCourseName] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [notice, setNotice] = useState<LessonNotice | null>(null)
  const [total, setTotal] = useState(0)

  async function openCourse(course: LessonCardModel) {
    setSelectedCourse(course)
    setDetailLoading(true)
    setNotice(null)
    try {
      const [detail, teachingMeta] = await Promise.all([getCourse(course.id), loadTeachingMeta(course.id)])
      const detailIndex = Math.max(0, courses.findIndex((item) => item.id === course.id))
      const detailCard = toLessonCard(detail, detailIndex, teachingMeta)
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
      const teachingMetaMap = await loadTeachingMetaMap(response.items)
      const nextCourses = response.items.map((item, index) => toLessonCard(item, index, teachingMetaMap.get(item.id)))
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

  async function handleCreateCourse() {
    const name = normalizeCourseName(courseName)
    if (!name) {
      setNotice({ type: 'info', message: '请输入课程名称后再创建课程。' })
      return
    }

    setCreating(true)
    setNotice(null)
    try {
      const course = await createCourse({ name, description: null })
      setCourseName('')
      setQuery('')
      await loadCourses(course.id, { keepNotice: true })
      setNotice({
        type: 'success',
        message: `课程已创建，课程码：${course.code || course.invite_code || '已生成'}。`
      })
    } catch (error) {
      setNotice({ type: 'error', message: productErrorMessage(error, '课程创建失败，请稍后重试。') })
    } finally {
      setCreating(false)
    }
  }

  async function handleArchiveCourse(course: LessonCardModel) {
    if (course.raw.status === 'archived') {
      setNotice({ type: 'info', message: '该课程已归档。' })
      return
    }

    setArchiving(true)
    setNotice(null)
    try {
      const archived = await archiveCourse(course.id)
      await loadCourses(archived.id, { keepNotice: true })
      setNotice({ type: 'success', message: '课程已归档，列表已刷新。' })
    } catch (error) {
      setNotice({ type: 'error', message: productErrorMessage(error, '课程归档失败，请稍后重试。') })
    } finally {
      setArchiving(false)
    }
  }

  function enterCourse(course: LessonCardModel) {
    window.location.assign(`/teacher/courses/${course.id}`)
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
      learning: courses.filter((course) => course.status === '授课中' || course.status === '管理中').length,
      tasks: courses.reduce((sum, course) => sum + course.assignmentTotal, 0),
      completed: courses.reduce((sum, course) => sum + course.assignmentCompleted, 0)
    }),
    [courses, total]
  )

  return (
    <main className="mine-lessons-page teacher-courses-page" data-testid="external-teacher-courses">
      <TopNav />
      <section className="page-grid">
        <div className="workspace-column">
          <header className="page-hero">
            <div>
              <h1>我的课程</h1>
              <span>My Courses</span>
              <p>管理、发布与复盘你的全部授课课程。</p>
            </div>
            <div className="toolbar-row">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input
                  value={query}
                  placeholder="搜索课程名称 / 课程码 / 状态"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className="join-code-box">
                <span>课程名称</span>
                <input value={courseName} placeholder="例如：FastAPI 后端开发" onChange={(event) => setCourseName(event.target.value)} />
              </label>
              <button className="add-button" type="button" disabled={creating} onClick={() => void handleCreateCourse()}>
                {creating ? '创建中...' : '创建课程'}
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
              授课中
            </span>
            <span>
              <strong>{stats.tasks}</strong>
              已发布任务
            </span>
            <span>
              <strong>{stats.completed}</strong>
              学生提交
            </span>
          </div>
          <DetailPanel
            course={selectedCourse}
            joining={creating || archiving}
            loading={loading || detailLoading}
            notice={notice}
            onEnter={enterCourse}
            onJoin={() => void handleCreateCourse()}
            onArchive={(course) => void handleArchiveCourse(course)}
            onRefresh={() => void loadCourses(selectedCourse?.id)}
          />
        </aside>
      </section>
    </main>
  )
}
