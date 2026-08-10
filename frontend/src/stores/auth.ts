import { defineStore } from 'pinia'

import { loginApi, logoutApi, meApi, registerApi, type LoginRequest, type RegisterRequest } from '@/api/auth'
import { clearAuthStorage, getRefreshToken, getStoredUser, getToken, setRefreshToken, setStoredUser, setToken, type UserInfo, type UserRole } from '@/utils/storage'

interface AuthState {
  token: string
  refreshToken: string
  user: UserInfo | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: getToken(),
    refreshToken: getRefreshToken(),
    user: getStoredUser()
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user),
    role: (state): UserRole | undefined => state.user?.role
  },
  actions: {
    async login(payload: LoginRequest) {
      const data = await loginApi(payload)
      this.setSession(data.access_token, data.refresh_token, data.user)
      return data.user
    },
    async register(payload: RegisterRequest) {
      return registerApi(payload)
    },
    async fetchMe() {
      if (!this.token) return null
      const user = await meApi()
      this.user = user
      setStoredUser(user)
      return user
    },
    setSession(token: string, refreshToken: string, user: UserInfo) {
      this.token = token
      this.refreshToken = refreshToken
      this.user = user
      setToken(token)
      setRefreshToken(refreshToken)
      setStoredUser(user)
    },
    updateStoredUser(user: UserInfo) {
      this.user = user
      setStoredUser(user)
    },
    async logout() {
      try {
        if (this.token) await logoutApi()
      } finally {
        this.clearSession()
      }
    },
    clearSession() {
      this.token = ''
      this.refreshToken = ''
      this.user = null
      clearAuthStorage()
    }
  }
})
