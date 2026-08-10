import request from './request'
import type { UserInfo, UserRole } from '@/utils/storage'

export interface LoginRequest {
  username: string
  password: string
  role?: UserRole
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
  full_name?: string
  role: UserRole
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: UserInfo
}

export function loginApi(payload: LoginRequest) {
  return request.post<LoginResponse, LoginResponse>('/auth/login', payload)
}

export function registerApi(payload: RegisterRequest) {
  return request.post<UserInfo, UserInfo>('/auth/register', payload)
}

export function meApi() {
  return request.get<UserInfo, UserInfo>('/auth/me')
}

export function logoutApi() {
  return request.post<{ logged_out: boolean }, { logged_out: boolean }>('/auth/logout')
}
