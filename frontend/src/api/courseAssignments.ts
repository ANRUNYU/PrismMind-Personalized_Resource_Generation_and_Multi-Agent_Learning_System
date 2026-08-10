import request from './request'
import type {
  CourseAssignment,
  CourseAssignmentCreateRequest,
  CourseAssignmentListResponse,
  CourseAssignmentStartResponse,
  CourseAssignmentSubmission,
  CourseAssignmentSubmissionListResponse,
  CourseAssignmentSubmitRequest,
  CourseAssignmentSubmitResponse
} from '@/types/courseAssignment'

export interface CourseAssignmentListParams {
  page?: number
  page_size?: number
}

export function createCourseAssignment(courseId: number | string, payload: CourseAssignmentCreateRequest) {
  return request.post<CourseAssignment, CourseAssignment>(`/courses/${courseId}/assignments`, payload)
}

export function listCourseAssignments(courseId: number | string, params?: CourseAssignmentListParams) {
  return request.get<CourseAssignmentListResponse, CourseAssignmentListResponse>(`/courses/${courseId}/assignments`, { params })
}

export function getCourseAssignment(courseId: number | string, assignmentId: number | string) {
  return request.get<CourseAssignment, CourseAssignment>(`/courses/${courseId}/assignments/${assignmentId}`)
}

export function startCourseAssignment(courseId: number | string, assignmentId: number | string) {
  return request.post<CourseAssignmentStartResponse, CourseAssignmentStartResponse>(
    `/courses/${courseId}/assignments/${assignmentId}/start`
  )
}

export function submitCourseAssignment(
  courseId: number | string,
  assignmentId: number | string,
  payload: CourseAssignmentSubmitRequest
) {
  return request.post<CourseAssignmentSubmitResponse, CourseAssignmentSubmitResponse>(
    `/courses/${courseId}/assignments/${assignmentId}/submit`,
    payload
  )
}

export function listCourseAssignmentSubmissions(
  courseId: number | string,
  assignmentId: number | string,
  params?: CourseAssignmentListParams
) {
  return request.get<CourseAssignmentSubmissionListResponse, CourseAssignmentSubmissionListResponse>(
    `/courses/${courseId}/assignments/${assignmentId}/submissions`,
    { params }
  )
}

export function getMyCourseAssignmentSubmission(courseId: number | string, assignmentId: number | string) {
  return request.get<CourseAssignmentSubmission, CourseAssignmentSubmission>(
    `/courses/${courseId}/assignments/${assignmentId}/submissions/me`
  )
}

export function closeCourseAssignment(courseId: number | string, assignmentId: number | string) {
  return request.post<CourseAssignment, CourseAssignment>(`/courses/${courseId}/assignments/${assignmentId}/close`)
}
