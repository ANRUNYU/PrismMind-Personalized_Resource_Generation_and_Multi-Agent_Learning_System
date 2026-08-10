import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { setupRouterGuards } from './guards'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { studentRoutes } from './routes/student'
import { teacherRoutes } from './routes/teacher'
import MainLayout from '@/layouts/MainLayout.vue'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    public?: boolean
    requiresAuth?: boolean
    roles?: Array<'teacher' | 'student' | 'admin'>
    layout?: 'main' | 'external-full-page'
    fullPageExternal?: boolean
    hiddenMenuKeys?: string[]
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/auth/login' },
  ...authRoutes,
  ...teacherRoutes,
  ...studentRoutes,
  ...adminRoutes,
  {
    path: '/account',
    component: MainLayout,
    meta: { requiresAuth: true, roles: ['teacher', 'student', 'admin'] },
    children: [
      {
        path: '',
        name: 'AccountProfile',
        component: () => import('@/views/account/AccountProfile.vue'),
        meta: { requiresAuth: true, roles: ['teacher', 'student', 'admin'], title: '个人中心' }
      }
    ]
  },
  {
    path: '/assistant',
    component: MainLayout,
    meta: { requiresAuth: true, roles: ['teacher', 'student', 'admin'] },
    children: [
      {
        path: '',
        name: 'AssistantChat',
        component: () => import('@/views/assistant/AssistantChat.vue'),
        meta: { requiresAuth: true, roles: ['teacher', 'student', 'admin'], title: '智能聊天助手' }
      }
    ]
  },
  {
    path: '/tasks',
    component: MainLayout,
    meta: { requiresAuth: true, roles: ['teacher', 'student', 'admin'] },
    children: [
      {
        path: '',
        name: 'TaskCenter',
        component: () => import('@/views/tasks/TaskCenter.vue'),
        meta: { requiresAuth: true, roles: ['teacher', 'student', 'admin'], title: '任务中心' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/dashboard/NotFound.vue'),
    meta: { public: true, title: '页面不存在' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

setupRouterGuards(router)

export default router
