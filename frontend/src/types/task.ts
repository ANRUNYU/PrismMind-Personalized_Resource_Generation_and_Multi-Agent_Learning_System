export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | string

export type TaskType =
  | 'teacher_training_plan'
  | 'teacher_course_design'
  | 'teacher_teaching_design'
  | 'teacher_exercise'
  | 'teacher_paper'
  | 'teacher_project'
  | 'knowledge_ingest'
  | 'student_resource_generation'
  | 'student_resource_single_generation'
  | 'student_test_generation'
  | string

export interface TaskItem {
  id: number
  task_type: TaskType
  status: TaskStatus
  progress: number
  result_artifact_id?: number | null
  error_message?: string | null
  current_stage?: string | null
  status_message?: string | null
  partial_content?: string | null
  result_payload?: Record<string, unknown>
  started_at?: string | null
  finished_at?: string | null
  created_at: string
  updated_at?: string | null
}

export interface TaskDetail extends TaskItem {
  input_payload?: Record<string, unknown> | null
}

export interface TaskListResponse {
  items: TaskItem[]
  total: number
  page: number
  page_size: number
}

export interface TaskQuery {
  page?: number
  page_size?: number
  status?: TaskStatus | ''
  task_type?: TaskType | ''
}

export interface TaskCreateResponse {
  task_id: number
  task_type: TaskType
  status: TaskStatus
  polling_url: string
  stream_url?: string | null
}

export type TaskEventType = 'meta' | 'stage' | 'delta' | 'reference' | 'warning' | 'done' | 'error'

export interface TaskStreamEvent {
  type: TaskEventType
  event_id?: string | null
  task_id: number
  stage?: string | null
  progress?: number | null
  message?: string | null
  text?: string | null
  reference?: Record<string, unknown> | null
  result_payload?: Record<string, unknown> | null
  error?: string | null
  status?: TaskStatus
  snapshot?: boolean
}

export interface CitationItem {
  citation_id: string
  source_filename: string
  file_id?: number | null
  document_id?: number | null
  page_number?: number | null
  slide_number?: number | null
  sheet_name?: string | null
  heading_path?: string[]
  similarity?: number | null
  excerpt?: string | null
  open_url?: string | null
}
