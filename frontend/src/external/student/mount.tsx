import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import ExternalMineExercises from './mine/ExternalMineExercises'
import ExternalMineLessons from './mine/my_lessons/ExternalStudentCourses'
import ExternalStudentAssessments from './effect_appraisal/ExternalStudentAssessments'
import ExternalStudentProfile from './portrait_construction/ExternalStudentProfile'
import ExternalStudentResources from './resources_access/ExternalStudentResources'
import ExternalStudentMain from './student_main/VanillaStudentDashboard'
import ExternalStudentLearningPaths from './study_plan/ExternalStudentLearningPaths'
import ExternalStudentTests from './mine/my_tests/ExternalStudentTests'
import ExternalStudentTutoring from './tutoring_QA/ExternalStudentTutoring'

export type StudentExternalPage =
  | 'student-main'
  | 'student-courses'
  | 'mine-exercises'
  | 'student-tests'
  | 'student-profile'
  | 'student-resources'
  | 'student-tutoring'
  | 'student-learning-paths'
  | 'student-assessments'

export function mountStudentExternalPage(container: HTMLElement, page: StudentExternalPage) {
  let root: Root | null = createRoot(container)

  const elementMap: Record<StudentExternalPage, React.ReactElement> = {
    'student-main': <ExternalStudentMain />,
    'student-courses': <ExternalMineLessons />,
    'mine-exercises': <ExternalMineExercises />,
    'student-tests': <ExternalStudentTests />,
    'student-profile': <ExternalStudentProfile />,
    'student-resources': <ExternalStudentResources />,
    'student-tutoring': <ExternalStudentTutoring />,
    'student-learning-paths': <ExternalStudentLearningPaths />,
    'student-assessments': <ExternalStudentAssessments />
  }

  root.render(elementMap[page])

  return () => {
    root?.unmount()
    root = null
  }
}
