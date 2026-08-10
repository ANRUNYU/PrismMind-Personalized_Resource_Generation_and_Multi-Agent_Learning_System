import type { LessonCardModel, LessonNotice } from '../types'

interface Props {
  course: LessonCardModel | null
  joining: boolean
  loading: boolean
  notice: LessonNotice | null
  onEnter: (course: LessonCardModel) => void
  onJoin: () => void
  onRefresh: () => void
}

export default function DetailPanel({ course, joining, loading, notice, onEnter, onJoin, onRefresh }: Props) {
  if (!course) {
    return (
      <aside className="detail-panel lesson-detail-panel">
        <span className="detail-kicker">课程详情</span>
        <h2>等待选择课程</h2>
        <p>点击棱镜课程卡片后，右侧会显示课程教师、成员规模、已发布任务和学习入口。</p>
        {notice ? <div className={`lesson-action-notice is-${notice.type}`}>{notice.message}</div> : null}
        <button className="primary-action" type="button" disabled={joining} onClick={onJoin}>
          加入课程
        </button>
        <button className="secondary-action" type="button" disabled={loading} onClick={onRefresh}>
          刷新课程
        </button>
      </aside>
    )
  }

  const progressScale = course.progressPercent === null ? 0 : course.progressPercent / 100

  return (
    <aside className="detail-panel lesson-detail-panel">
      <span className="detail-kicker">{course.status}</span>
      <h2>{course.title}</h2>
      <div className="teacher-row">
        <span className="teacher-avatar">{course.teacher?.slice(0, 1) || '课'}</span>
        <div>
          <strong>{course.teacher}</strong>
          <small>{course.department}</small>
        </div>
      </div>
      <p>{course.summary}</p>

      <div className="detail-progress">
        <div>
          <span>学习进度</span>
          <strong>{course.progressPercent === null ? course.progressLabel : `${course.progressPercent}%`}</strong>
        </div>
        <div className="lesson-progress-track">
          <span style={{ transform: `scaleX(${progressScale})` }} />
        </div>
        <small>{course.progressCaption}</small>
      </div>

      <div className="detail-metrics">
        <span>
          <strong>{course.assignmentTotal}</strong>
          课程任务
        </span>
        <span>
          <strong>{course.assignmentCompleted}</strong>
          已完成
        </span>
        <span>
          <strong>{course.studentCount}</strong>
          同学加入
        </span>
      </div>

      <div className="tag-row">
        {course.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      {notice ? <div className={`lesson-action-notice is-${notice.type}`}>{notice.message}</div> : null}

      <button className="primary-action" type="button" onClick={() => onEnter(course)}>
        进入学习
      </button>
      <button className="secondary-action" type="button" disabled={loading} onClick={onRefresh}>
        刷新详情
      </button>
    </aside>
  )
}