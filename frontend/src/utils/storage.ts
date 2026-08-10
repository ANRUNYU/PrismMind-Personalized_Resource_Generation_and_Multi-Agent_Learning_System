const TOKEN_KEY = 'edugenie_access_token'
const REFRESH_TOKEN_KEY = 'edugenie_refresh_token'
const USER_KEY = 'edugenie_user_info'

export type UserRole = 'teacher' | 'student' | 'admin'

export interface UserInfo {
  id: number
  username: string
  email: string
  full_name?: string | null
  role: UserRole
  is_active: boolean
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || ''
}

export function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function getStoredUser(): UserInfo | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserInfo
  } catch {
    return null
  }
}

export function setStoredUser(user: UserInfo) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export const storageKeys = {
  token: TOKEN_KEY,
  refreshToken: REFRESH_TOKEN_KEY,
  user: USER_KEY
}
