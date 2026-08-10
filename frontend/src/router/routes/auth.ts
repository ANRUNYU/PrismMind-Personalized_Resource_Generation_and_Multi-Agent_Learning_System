import type { RouteRecordRaw } from 'vue-router'

import ExternalFullPageLayout from '@/layouts/ExternalFullPageLayout.vue'

export const authRoutes: RouteRecordRaw[] = [
  {
    path: '/auth',
    component: ExternalFullPageLayout,
    meta: { public: true, layout: 'external-full-page', fullPageExternal: true },
    redirect: '/auth/login',
    children: [
      {
        path: 'login',
        name: 'Login',
        component: () => import('@/views/auth/Login.vue'),
        meta: { public: true, title: '登录', layout: 'external-full-page', fullPageExternal: true }
      },
      {
        path: 'register',
        name: 'Register',
        component: () => import('@/views/auth/Register.vue'),
        meta: { public: true, title: '注册', layout: 'external-full-page', fullPageExternal: true }
      },
      {
        path: 'loading',
        name: 'AuthLoading',
        component: () => import('@/views/auth/Loading.vue'),
        meta: { public: true, title: '加载中', layout: 'external-full-page', fullPageExternal: true }
      }
    ]
  }
]
