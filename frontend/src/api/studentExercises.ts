import request from './request'
import type {
  StudentExerciseCreateRequest,
  StudentExerciseListResponse,
  StudentExerciseRead,
  StudentExerciseStartResponse,
  StudentExerciseSubmitRequest,
  StudentExerciseSubmitResponse,
  StudentExerciseUpdateRequest
} from '@/types/studentExercise'

export interface StudentExerciseListParams {
  page?: number
  page_size?: number
}

export function listStudentExercises(params?: StudentExerciseListParams) {
  return request.get<StudentExerciseListResponse, StudentExerciseListResponse>('/student/exercises', { params })
}

export function createStudentExercise(payload: StudentExerciseCreateRequest) {
  return request.post<StudentExerciseRead, StudentExerciseRead>('/student/exercises', payload)
}

export function getStudentExercise(exerciseId: string) {
  return request.get<StudentExerciseRead, StudentExerciseRead>(`/student/exercises/${exerciseId}`)
}

export function updateStudentExercise(exerciseId: string, payload: StudentExerciseUpdateRequest) {
  return request.patch<StudentExerciseRead, StudentExerciseRead>(`/student/exercises/${exerciseId}`, payload)
}

export function deleteStudentExercise(exerciseId: string) {
  return request.delete<{ exercise_id: string; deleted: boolean }, { exercise_id: string; deleted: boolean }>(
    `/student/exercises/${exerciseId}`
  )
}

export function startStudentExercise(exerciseId: string) {
  return request.post<StudentExerciseStartResponse, StudentExerciseStartResponse>(`/student/exercises/${exerciseId}/start`)
}

export function submitStudentExercise(exerciseId: string, payload: StudentExerciseSubmitRequest) {
  return request.post<StudentExerciseSubmitResponse, StudentExerciseSubmitResponse>(
    `/student/exercises/${exerciseId}/submit`,
    payload
  )
}

export function favoriteStudentExercise(exerciseId: string) {
  return request.post<StudentExerciseRead, StudentExerciseRead>(`/student/exercises/${exerciseId}/favorite`)
}

export function completeStudentExercise(exerciseId: string) {
  return request.post<StudentExerciseRead, StudentExerciseRead>(`/student/exercises/${exerciseId}/complete`)
}
