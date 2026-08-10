import type { RouteRecordRaw } from 'vue-router'

import ExternalFullPageLayout from '@/layouts/ExternalFullPageLayout.vue'
import TeacherLayout from '@/layouts/TeacherLayout.vue'

const teacherMeta = { requiresAuth: true, roles: ['teacher', 'admin'] as Array<'teacher' | 'admin'> }
const teacherExternalMeta = {
  ...teacherMeta,
  layout: 'external-full-page' as const,
  fullPageExternal: true
}

export const teacherRoutes: RouteRecordRaw[] = [
  {
    path: '/teacher/dashboard',
    component: ExternalFullPageLayout,
    meta: teacherExternalMeta,
    children: [
      {
        path: '',
        name: 'TeacherDashboard',
        component: () => import('@/views/teacher/TeacherDashboard.vue'),
        meta: { ...teacherExternalMeta, title: '教师首页' }
      }
    ]
  },
  {
    path: '/teacher/training-plans',
    component: ExternalFullPageLayout,
    meta: teacherExternalMeta,
    children: [
      {
        path: '',
        name: 'TeacherTrainingPlans',
        component: () => import('@/views/teacher/TeacherTrainingPlans.vue'),
        meta: { ...teacherExternalMeta, title: '培养方案' }
      }
    ]
  },
  {
    path: '/teacher/course-designs',
    component: ExternalFullPageLayout,
    meta: teacherExternalMeta,
    children: [
      {
        path: '',
        name: 'TeacherCourseDesigns',
        component: () => import('@/views/teacher/TeacherCourseDesigns.vue'),
        meta: { ...teacherExternalMeta, title: '课程设计' }
      }
    ]
  },
  {
    path: '/teacher/exercises',
    component: ExternalFullPageLayout,
    meta: teacherExternalMeta,
    children: [
      {
        path: '',
        name: 'TeacherExercises',
        component: () => import('@/views/teacher/TeacherExercises.vue'),
        meta: { ...teacherExternalMeta, title: '练习题' }
      }
    ]
  },
  {
    path: '/teacher/papers',
    component: ExternalFullPageLayout,
    meta: teacherExternalMeta,
    children: [
      {
        path: '',
        name: 'TeacherPapers',
        component: () => import('@/views/teacher/TeacherPapers.vue'),
        meta: { ...teacherExternalMeta, title: '试卷生成' }
      }
    ]
  },
  {
    path: '/teacher/courses',
    component: ExternalFullPageLayout,
    meta: teacherExternalMeta,
    children: [
      {
        path: '',
        name: 'TeacherCourses',
        component: () => import('@/views/teacher/TeacherCourses.vue'),
        meta: { ...teacherExternalMeta, title: '我的课程' }
      }
    ]
  },
  {
    path: '/teacher',
    component: TeacherLayout,
    redirect: '/teacher/dashboard',
    meta: teacherMeta,
    children: [
      {
        path: 'courses/:id',
        name: 'TeacherCourseDetail',
        component: () => import('@/views/teacher/TeacherCourseDetail.vue'),
        meta: { ...teacherMeta, title: '课程详情' }
      },
      {
        path: 'teaching-designs',
        name: 'TeacherTeachingDesigns',
        component: () => import('@/views/teacher/TeacherGenerationView.vue'),
        props: { kind: 'teaching-design' },
        meta: { ...teacherMeta, title: '教学设计' }
      },
      {
        path: 'projects',
        name: 'TeacherProjects',
        component: () => import('@/views/teacher/TeacherGenerationView.vue'),
        props: { kind: 'project' },
        meta: { ...teacherMeta, title: '项目实践' }
      },
      {
        path: 'files',
        name: 'TeacherFiles',
        component: () => import('@/views/knowledge/FileCenter.vue'),
        meta: { ...teacherMeta, title: '文件中心' }
      },
      {
        path: 'knowledge',
        name: 'TeacherKnowledge',
        component: () => import('@/views/knowledge/KnowledgeManager.vue'),
        meta: {
          ...teacherMeta,
          title: '知识库',
          hiddenMenuKeys: ['teacher-teaching', 'teacher-projects', 'tasks']
        }
      },
      {
        path: 'artifacts',
        name: 'TeacherArtifacts',
        component: () => import('@/views/teacher/ArtifactsList.vue'),
        meta: { ...teacherMeta, title: '生成历史' }
      },
      {
        path: 'artifacts/:id',
        name: 'TeacherArtifactDetail',
        component: () => import('@/views/teacher/ArtifactDetail.vue'),
        meta: {
          ...teacherMeta,
          title: '生成详情',
          hiddenMenuKeys: ['teacher-teaching', 'teacher-projects', 'tasks']
        }
      }
    ]
  }
]
