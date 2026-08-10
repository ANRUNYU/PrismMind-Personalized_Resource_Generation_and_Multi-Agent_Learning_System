import type { RouteRecordRaw } from 'vue-router'

import ExternalFullPageLayout from '@/layouts/ExternalFullPageLayout.vue'

export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    redirect: '/admin/dashboard'
  },
  {
    path: '/admin/dashboard',
    component: ExternalFullPageLayout,
    meta: { requiresAuth: true, roles: ['admin'], layout: 'external-full-page', fullPageExternal: true },
    children: [
      {
        path: '',
        name: 'AdminDashboard',
        component: () => import('@/views/dashboard/AdminDashboard.vue'),
        meta: {
          title: '系统概览',
          requiresAuth: true,
          roles: ['admin'],
          layout: 'external-full-page',
          fullPageExternal: true
        }
      }
    ]
  },
  {
    path: '/admin/users',
    component: ExternalFullPageLayout,
    meta: { requiresAuth: true, roles: ['admin'], layout: 'external-full-page', fullPageExternal: true },
    children: [
      {
        path: '',
        name: 'AdminUsers',
        component: () => import('@/views/admin/UserManagement.vue'),
        meta: {
          title: '用户管理',
          requiresAuth: true,
          roles: ['admin'],
          layout: 'external-full-page',
          fullPageExternal: true
        }
      }
    ]
  }
]
