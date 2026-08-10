import request from './request'
import type {
  Course,
  CourseCreatePayload,
  CourseJoinPayload,
  CourseJoinResponse,
  CourseListResponse,
  CourseMemberListResponse,
  CourseUpdatePayload
} from '@/types/course'

export interface CourseListParams {
  page?: number
  page_size?: number
}

export function getMyCourses(params?: CourseListParams) {
  return request.get<CourseListResponse, CourseListResponse>('/courses/my', { params })
}

export function getCourse(courseId: number | string) {
  return request.get<Course, Course>(`/courses/${courseId}`)
}

export function createCourse(payload: CourseCreatePayload) {
  return request.post<Course, Course>('/courses', payload)
}

export function updateCourse(courseId: number | string, payload: CourseUpdatePayload) {
  return request.patch<Course, Course>(`/courses/${courseId}`, payload)
}

export function archiveCourse(courseId: number | string) {
  return request.post<Course, Course>(`/courses/${courseId}/archive`)
}

export function joinCourse(payload: CourseJoinPayload) {
  return request.post<CourseJoinResponse, CourseJoinResponse>('/courses/join', payload)
}

export function getCourseMembers(courseId: number | string, params?: CourseListParams) {
  return request.get<CourseMemberListResponse, CourseMemberListResponse>(`/courses/${courseId}/members`, { params })
}
