import request from './request'
import type { UserInfo, UserRole } from '@/utils/storage'

export interface AdminUser extends UserInfo {
  created_at?: string | null
  updated_at?: string | null
  last_login_at?: string | null
}

export interface UserListResponse {
  items: AdminUser[]
  total: number
  page: number
  page_size: number
}

export interface UserListParams {
  page?: number
  page_size?: number
}

export interface UserStatusUpdate {
  is_active: boolean
}

export interface MyProfileUpdate {
  full_name: string
}

export interface MyPasswordChange {
  current_password: string
  new_password: string
  confirm_password: string
}

export const userRoleLabels: Record<UserRole, string> = {
  teacher: '教师',
  student: '学生',
  admin: '管理员'
}

export function getUsers(params?: UserListParams) {
  return request.get<UserListResponse, UserListResponse>('/users', { params })
}

export function updateUserStatus(userId: number, payload: UserStatusUpdate) {
  return request.patch<AdminUser, AdminUser>(`/users/${userId}/status`, payload)
}

export function getMyProfile() {
  return request.get<AdminUser, AdminUser>('/users/me')
}

export function updateMyProfile(payload: MyProfileUpdate) {
  return request.patch<AdminUser, AdminUser>('/users/me/profile', payload)
}

export function changeMyPassword(payload: MyPasswordChange) {
  return request.post<{ updated: boolean }, { updated: boolean }>('/users/me/password', payload)
}
