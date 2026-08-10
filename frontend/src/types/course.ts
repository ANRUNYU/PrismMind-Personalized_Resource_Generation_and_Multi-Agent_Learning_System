export type CourseStatus = 'active' | 'archived'
export type CourseMemberRole = 'teacher' | 'student'
export type CourseMemberStatus = 'active' | 'removed'

export interface Course {
  id: number
  name: string
  description?: string | null
  code: string
  invite_code: string
  teacher_id?: number | null
  teacher_name?: string | null
  student_count: number
  current_user_role?: CourseMemberRole | 'admin' | null
  status: CourseStatus
  created_at: string
  updated_at: string
}

export interface CourseMember {
  id: number
  course_id: number
  user_id: number
  username: string
  email: string
  full_name?: string | null
  role: CourseMemberRole
  status: CourseMemberStatus
  profile?: CourseMemberProfileSnapshot | null
  joined_at: string
  created_at: string
  updated_at: string
}

export interface CourseMemberProfileSnapshot {
  knowledge_score: number
  practice_score: number
  innovation_score: number
  exam_score: number
  efficiency_score: number
  quality_score: number
  learning_goal?: string | null
  current_course?: string | null
  weaknesses: string[]
  mastered_topics: string[]
  profile_summary?: string | null
  updated_at: string
}

export interface CourseListResponse {
  items: Course[]
  total: number
  page: number
  page_size: number
}

export interface CourseMemberListResponse {
  items: CourseMember[]
  total: number
  page: number
  page_size: number
}

export interface CourseCreatePayload {
  name: string
  description?: string | null
}

export interface CourseUpdatePayload {
  name?: string | null
  description?: string | null
}

export interface CourseJoinPayload {
  code: string
}

export interface CourseJoinResponse {
  course: Course
  member: CourseMember
  already_joined: boolean
}
