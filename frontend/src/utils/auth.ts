import type { UserRole } from './storage'

export function roleHomePath(role?: UserRole | null) {
  if (role === 'teacher') return '/teacher/dashboard'
  if (role === 'student') return '/student/dashboard'
  if (role === 'admin') return '/admin/dashboard'
  return '/auth/login'
}

export function canAccessRole(userRole: UserRole | undefined | null, allowedRoles?: UserRole[]) {
  if (!allowedRoles?.length) return true
  if (!userRole) return false
  return allowedRoles.includes(userRole)
}
