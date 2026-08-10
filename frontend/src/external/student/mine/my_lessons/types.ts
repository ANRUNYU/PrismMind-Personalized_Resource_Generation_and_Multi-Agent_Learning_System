import type { Course } from '@/types/course'

export interface LessonCardModel {
  id: number
  title: string
  teacher: string
  department: string
  status: string
  progressPercent: number | null
  progressLabel: string
  progressCaption: string
  updatedAt: string
  tags: string[]
  summary: string
  assignmentTotal: number
  assignmentCompleted: number
  assignmentPublished: number
  accent: string
  code: string
  studentCount: number
  role: string
  raw: Course
}

export interface LessonNotice {
  type: 'success' | 'error' | 'info'
  message: string
}