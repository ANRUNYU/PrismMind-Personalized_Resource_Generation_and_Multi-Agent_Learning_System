import type { AxiosProgressEvent } from 'axios'

import request from './request'
import type { TaskCreateResponse } from '@/types/task'
import type {
  CourseFile,
  CourseFileListResponse,
  CourseKnowledgeDeleteResponse,
  CourseKnowledgeCopyResponse,
  CourseKnowledgeDocument,
  CourseKnowledgeDocumentCreatePayload,
  CourseKnowledgeDocumentListResponse,
  CourseKnowledgeIngestResponse,
  CourseKnowledgeRetrieveRequest,
  CourseKnowledgeRetrieveResponse
} from '@/types/courseKnowledge'

export interface CourseKnowledgeListParams {
  page?: number
  page_size?: number
}

export function listCourseFiles(courseId: number | string, params?: CourseKnowledgeListParams) {
  return request.get<CourseFileListResponse, CourseFileListResponse>(`/courses/${courseId}/files`, { params })
}

export function uploadCourseFile(
  courseId: number | string,
  formData: FormData,
  onUploadProgress?: (event: AxiosProgressEvent) => void
) {
  return request.post<CourseFile, CourseFile>(`/courses/${courseId}/files/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  })
}

export function listCourseKnowledgeDocuments(courseId: number | string, params?: CourseKnowledgeListParams) {
  return request.get<CourseKnowledgeDocumentListResponse, CourseKnowledgeDocumentListResponse>(
    `/courses/${courseId}/knowledge/documents`,
    { params }
  )
}

export function createCourseKnowledgeDocument(
  courseId: number | string,
  payload: CourseKnowledgeDocumentCreatePayload
) {
  return request.post<CourseKnowledgeDocument, CourseKnowledgeDocument>(
    `/courses/${courseId}/knowledge/documents`,
    payload
  )
}

export function ingestCourseKnowledgeDocument(courseId: number | string, documentId: number | string) {
  return request.post<CourseKnowledgeIngestResponse, CourseKnowledgeIngestResponse>(
    `/courses/${courseId}/knowledge/documents/${documentId}/ingest`
  )
}

export function ingestCourseKnowledgeDocumentAsync(courseId: number | string, documentId: number | string) {
  return request.post<TaskCreateResponse, TaskCreateResponse>(
    `/courses/${courseId}/knowledge/documents/${documentId}/ingest-async`
  )
}

export function retrieveCourseKnowledge(
  courseId: number | string,
  payload: CourseKnowledgeRetrieveRequest
) {
  return request.post<CourseKnowledgeRetrieveResponse, CourseKnowledgeRetrieveResponse>(
    `/courses/${courseId}/knowledge/retrieve`,
    payload
  )
}

export function deleteCourseKnowledgeDocument(courseId: number | string, documentId: number | string) {
  return request.delete<CourseKnowledgeDeleteResponse, CourseKnowledgeDeleteResponse>(
    `/courses/${courseId}/knowledge/documents/${documentId}`
  )
}


export function copyCourseKnowledgeToPersonal(courseId: number | string, documentId: number | string) {
  return request.post<CourseKnowledgeCopyResponse, CourseKnowledgeCopyResponse>(
    `/courses/${courseId}/knowledge/documents/${documentId}/copy-to-personal`
  )
}
