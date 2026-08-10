import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

import { clearAuthStorage, getRefreshToken, getToken, setRefreshToken, setToken } from '@/utils/storage'
import { resolveApiBaseURL } from '@/api/baseUrl'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  request_id: string
}

interface ApiErrorPayload {
  message?: string
  detail?: unknown
}

interface RetryConfig extends AxiosRequestConfig {
  _retry?: boolean
}

let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

export const apiBaseURL = resolveApiBaseURL()

const request = axios.create({
  baseURL: apiBaseURL,
  timeout: 60000
})

request.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (response) => {
    const payload = response.data
    if (payload && typeof payload === 'object' && 'code' in payload && 'data' in payload) {
      if (payload.code !== 0) {
        return Promise.reject(new Error(payload.message || 'Request failed'))
      }
      return payload.data
    }
    return payload
  },
  async (error: AxiosError<ApiErrorPayload>) => {
    const originalConfig = error.config as RetryConfig | undefined
    const status = error.response?.status
    const requestUrl = originalConfig?.url || ''
    const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register')
    const isRefreshRequest = requestUrl.includes('/auth/refresh')

    if (status === 401 && originalConfig && !originalConfig._retry && getRefreshToken() && !isAuthRequest && !isRefreshRequest) {
      originalConfig._retry = true
      try {
        const token = await refreshAccessToken()
        originalConfig.headers = originalConfig.headers || {}
        originalConfig.headers.Authorization = `Bearer ${token}`
        return request(originalConfig)
      } catch (refreshError) {
        clearAuthStorage()
        window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`
        return Promise.reject(refreshError)
      }
    }

    const message = getErrorMessage(error)
    if (status === 401 && !isAuthRequest) {
      clearAuthStorage()
      ElMessage.error(message || '登录状态已失效，请重新登录。')
      window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`
    } else {
      ElMessage.error(message)
    }
    return Promise.reject(new Error(message))
  }
)

function stringifyDetail(detail: unknown): string {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object') {
          const record = item as { loc?: unknown[]; msg?: string }
          const loc = Array.isArray(record.loc) ? record.loc.join('.') : ''
          return [loc, record.msg].filter(Boolean).join(': ')
        }
        return String(item)
      })
      .filter(Boolean)
      .join('; ')
  }
  if (typeof detail === 'object') {
    try {
      return JSON.stringify(detail)
    } catch {
      return ''
    }
  }
  return String(detail)
}

function getErrorMessage(error: AxiosError<ApiErrorPayload>) {
  if (!error.response) {
    return error.code === 'ECONNABORTED' ? '请求超时，请稍后重试。' : '网络连接暂时不稳定，请稍后重试。'
  }

  const status = error.response.status
  const payload = error.response.data
  const detail = stringifyDetail(payload?.detail)
  const serverMessage = payload?.message || ''

  if (detail && import.meta.env.DEV) {
    console.warn('请求错误详情:', payload?.detail)
  }
  if (serverMessage) return normalizeErrorMessage(serverMessage)
  if (detail) return normalizeErrorMessage(detail)
  if (status === 401) return '登录状态已失效，请重新登录。'
  if (status === 403) return '当前账号无权访问该数据。'
  if (status === 409) return '资源已存在或与现有数据冲突。'
  if (status === 422 || status === 400) return '请求参数不合法，请检查表单内容。'
  if (status >= 500) return '服务端内部错误，请检查后端日志。'
  return normalizeErrorMessage(error.message || '请求失败。')
}

function normalizeErrorMessage(message: string) {
  const normalized = message.trim()
  const lower = normalized.toLowerCase()
  const knownMessages: Record<string, string> = {
    'No permission to access this course': '当前账号无权访问该课程。',
    'No permission to manage this course': '当前账号无权管理该课程。',
    'No permission to access this file': '当前账号无权访问该文件。',
    'No permission to download this file': '当前账号无权下载该文件。',
    'No permission to delete this file': '当前账号无权删除该文件。',
    'No permission to use this file': '当前账号无权使用该文件。',
    'No permission to access this knowledge document': '当前账号无权访问该知识库文档。',
    'No permission to retrieve this document': '当前账号无权检索该知识库文档。',
    'No permission to access this learning path': '当前账号无权访问该学习路径。',
    'No permission to access this learning resource': '当前账号无权访问该学习资源。',
    'No permission to access this learning assessment': '当前账号无权访问该学习评估。',
    'No permission to rate this tutoring session': '当前账号无权评价该辅导会话。',
    'No permission to access this task': '当前账号无权访问该任务。',
    'No permission to access this assistant session': '当前账号无权访问该助手会话。',
    'No permission to access this attachment': '当前账号无权访问该附件。',
    'Parameter validation failed.': '请求参数不合法，请检查表单内容。'
  }
  if (lower.includes('student profile') && lower.includes('not') && lower.includes('created')) {
    return '尚未创建学习画像，请先创建画像。'
  }
  if (lower.includes('learning resource') && lower.includes('not found')) {
    return '未找到对应学习资源，请先在学习资源页面生成资源后再评估。'
  }
  if (lower.includes('learning path') && lower.includes('not found')) {
    return '未找到对应学习路径，请先创建学习路径后再评估。'
  }
  if (lower.includes('student test') && lower.includes('not found')) {
    return '未找到对应测试记录，请先完成一次测试后再评估。'
  }
  if (lower.includes('learning assessment') && lower.includes('not found')) {
    return '未找到对应学习评估记录。'
  }
  if (lower.includes('course') && lower.includes('not found')) {
    return '未找到对应课程，请先选择课程或使用系统默认课程。'
  }
  if (lower.includes('permission denied') || lower.includes('forbidden') || lower.startsWith('no permission to')) {
    return '当前账号无权访问该数据。'
  }
  if (lower.includes('unauthorized')) return '登录状态已失效，请重新登录。'
  if (lower === 'not found' || lower.endsWith(' not found')) return '未找到对应资源。'
  return knownMessages[normalized] || normalized
}

async function refreshAccessToken() {
  if (isRefreshing) {
    return new Promise<string>((resolve) => {
      refreshQueue.push(resolve)
    })
  }

  isRefreshing = true
  try {
    const refreshToken = getRefreshToken()
    const response = await axios.post<ApiResponse<{ access_token: string; refresh_token?: string }>>(
      `${apiBaseURL}/auth/refresh`,
      { refresh_token: refreshToken }
    )
    const nextToken = response.data.data.access_token
    setToken(nextToken)
    if (response.data.data.refresh_token) {
      setRefreshToken(response.data.data.refresh_token)
    }
    refreshQueue.forEach((resolve) => resolve(nextToken))
    refreshQueue = []
    return nextToken
  } finally {
    isRefreshing = false
  }
}

export default request
