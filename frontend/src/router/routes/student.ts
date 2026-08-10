import type { RouteRecordRaw } from 'vue-router'

import ExternalFullPageLayout from '@/layouts/ExternalFullPageLayout.vue'
import StudentLayout from '@/layouts/StudentLayout.vue'

const studentMeta = { requiresAuth: true, roles: ['student', 'admin'] as Array<'student' | 'admin'> }
const studentExternalMeta = {
  ...studentMeta,
  layout: 'external-full-page' as const,
  fullPageExternal: true
}

export const studentRoutes: RouteRecordRaw[] = [
  {
    path: '/student/dashboard',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: '',
        name: 'StudentDashboard',
        component: () => import('@/views/student/StudentDashboard.vue'),
        meta: { ...studentExternalMeta, title: '学生首页' }
      }
    ]
  },
  {
    path: '/student/courses',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: '',
        name: 'StudentCourses',
        component: () => import('@/views/student/StudentCourses.vue'),
        meta: { ...studentExternalMeta, title: '我的课程' }
      }
    ]
  },
  {
    path: '/student/profile',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: '',
        name: 'StudentProfile',
        component: () => import('@/views/student/StudentProfile.vue'),
        meta: { ...studentExternalMeta, title: '学习画像' }
      }
    ]
  },
  {
    path: '/student/tutoring',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: '',
        name: 'StudentTutoring',
        component: () => import('@/views/student/StudentTutoring.vue'),
        meta: { ...studentExternalMeta, title: 'RAG 辅导' }
      }
    ]
  },
  {
    path: '/student/resources',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: ':resourceId',
        name: 'StudentResourceDetail',
        component: () => import('@/views/student/StudentResourceDetail.vue'),
        meta: { ...studentExternalMeta, title: '学习资源详情' }
      },
      {
        path: '',
        name: 'StudentResources',
        component: () => import('@/views/student/StudentResources.vue'),
        meta: { ...studentExternalMeta, title: '学习资源' }
      }
    ]
  },
  {
    path: '/student/exercises',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: '',
        name: 'StudentExercises',
        component: () => import('@/views/student/StudentExercises.vue'),
        meta: { ...studentExternalMeta, title: '我的练习' }
      }
    ]
  },
  {
    path: '/student/learning-paths',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: ':pathId/steps/:stepId',
        name: 'StudentLearningPathStepDetail',
        component: () => import('@/views/student/StudentLearningPathStepDetail.vue'),
        meta: { ...studentExternalMeta, title: '学习路径步骤' }
      },
      {
        path: '',
        name: 'StudentLearningPaths',
        component: () => import('@/views/student/StudentLearningPaths.vue'),
        meta: { ...studentExternalMeta, title: '学习路径' }
      }
    ]
  },
  {
    path: '/student/assessments',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: '',
        name: 'StudentAssessments',
        component: () => import('@/views/student/StudentAssessments.vue'),
        meta: { ...studentExternalMeta, title: '学习评估' }
      }
    ]
  },
  {
    path: '/student/tests',
    component: ExternalFullPageLayout,
    meta: studentExternalMeta,
    children: [
      {
        path: '',
        name: 'StudentTests',
        component: () => import('@/views/student/StudentTests.vue'),
        meta: { ...studentExternalMeta, title: '学生测试' }
      }
    ]
  },
  {
    path: '/student',
    component: StudentLayout,
    redirect: '/student/dashboard',
    meta: studentMeta,
    children: [
      {
        path: 'courses/:id',
        name: 'StudentCourseStudy',
        component: () => import('@/views/student/StudentCourseStudy.vue'),
        meta: { ...studentMeta, title: '课程学习' }
      }
    ]
  }
]
