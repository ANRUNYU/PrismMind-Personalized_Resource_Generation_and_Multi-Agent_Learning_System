import { useEffect, useMemo, useState } from 'react'

import { getMyCourses } from '@/api/courses'
import type { Course } from '@/types/course'

export function TeacherClassSelector({
  value,
  disabled = false,
  onChange
}: {
  value: number | null
  disabled?: boolean
  onChange: (courseId: number | null) => void
}) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selected = useMemo(() => courses.find((course) => course.id === value) || null, [courses, value])

  useEffect(() => {
    let active = true
    setLoading(true)
    void getMyCourses({ page: 1, page_size: 100 })
      .then((response) => {
        if (!active) return
        setCourses(response.items.filter((course) => course.current_user_role === 'teacher' || course.current_user_role === 'admin'))
        setError('')
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : '班级列表加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <label className="form-field form-field--wide" htmlFor="teacherGenerationCourse">
      <span className="field-label">适用班级（可选）</span>
      <div className="field-control">
        <select
          id="teacherGenerationCourse"
          disabled={disabled || loading}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">不指定班级，按通用要求生成</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}（{course.student_count} 名学生）
            </option>
          ))}
        </select>
      </div>
      <span className="field-hint">
        {error || (selected
          ? `将实时参考“${selected.name}”的六维画像、薄弱点和课程作业整体达成率。`
          : '选择后，AI 会依据该班级整体水平调整难度、分层任务和评价方式。')}
      </span>
    </label>
  )
}
