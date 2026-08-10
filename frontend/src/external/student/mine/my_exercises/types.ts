import type { StudentExerciseRead, StudentExerciseSummary } from '@/types/studentExercise'

export interface ExerciseCardModel extends StudentExerciseSummary {
  card_id: string
  updated_label: string
  due_label: string
  height: number
  detail?: StudentExerciseRead | null
}

export type ExerciseActionNotice = {
  type: 'info' | 'success' | 'error'
  message: string
}
