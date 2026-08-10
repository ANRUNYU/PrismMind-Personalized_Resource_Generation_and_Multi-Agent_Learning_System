import type { Router } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { canAccessRole, roleHomePath } from '@/utils/auth'
import type { UserRole } from '@/utils/storage'

export function setupRouterGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    const isPublic = Boolean(to.meta.public)

    if (to.path === '/') {
      return roleHomePath(auth.role)
    }

    if (isPublic) {
      if (auth.isAuthenticated && (to.path === '/auth/login' || to.path === '/auth/register')) {
        return roleHomePath(auth.role)
      }
      return true
    }

    if (!auth.token) {
      return {
        path: '/auth/login',
        query: { redirect: to.fullPath }
      }
    }

    if (!auth.user) {
      try {
        await auth.fetchMe()
      } catch {
        auth.clearSession()
        return {
          path: '/auth/login',
          query: { redirect: to.fullPath }
        }
      }
    }

    const allowedRoles = to.meta.roles as UserRole[] | undefined
    if (!canAccessRole(auth.role, allowedRoles)) {
      return roleHomePath(auth.role)
    }

    return true
  })
}
