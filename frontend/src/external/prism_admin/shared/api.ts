export type UserRole = 'teacher' | 'student' | 'admin'

export interface ExternalUser {
  id: number
  username: string
  email: string
  full_name?: string | null
  role: UserRole
  is_active: boolean
  created_at?: string | null
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: ExternalUser
}

export interface UserListResponse {
  items: ExternalUser[]
  total: number
  page: number
  page_size: number
}

export interface LLMStatus {
  provider: string
  model: string
  real_provider_enabled: boolean
  fallback_enabled: boolean
  configured: boolean
  message: string
}

const TOKEN_KEY = 'edugenie_access_token'
const REFRESH_TOKEN_KEY = 'edugenie_refresh_token'
const USER_KEY = 'edugenie_user_info'

export const apiBaseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'

interface ApiEnvelope<T> {
  code?: number
  message?: string
  data?: T
  detail?: unknown
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getStoredUser(): ExternalUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ExternalUser
  } catch {
    return null
  }
}

export function persistSession(data: LoginResponse) {
  localStorage.setItem(TOKEN_KEY, data.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
}

export function roleHomePath(role?: UserRole | null) {
  if (role === 'teacher') return '/teacher/dashboard'
  if (role === 'student') return '/student/dashboard'
  if (role === 'admin') return '/admin/dashboard'
  return '/auth/login'
}

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

function toChineseMessage(message: string) {
  const normalized = message.trim()
  const lower = normalized.toLowerCase()
  const known: Record<string, string> = {
    'Parameter validation failed.': '请求参数不合法，请检查表单内容。',
    'User already exists': '用户已存在，请更换用户名或邮箱。',
    'Inactive user': '当前账号已被禁用，请联系管理员。'
  }
  if (lower.includes('student profile') && lower.includes('not') && lower.includes('created')) return '尚未创建学习画像，请先创建画像。'
  if (lower.includes('learning resource') && lower.includes('not found')) return '未找到对应学习资源，请先在学习资源页面生成资源后再评估。'
  if (lower.includes('learning path') && lower.includes('not found')) return '未找到对应学习路径，请先创建学习路径后再评估。'
  if (lower.includes('student test') && lower.includes('not found')) return '未找到对应测试记录，请先完成一次测试后再评估。'
  if (lower.includes('course') && lower.includes('not found')) return '未找到对应课程，请先选择课程或使用系统默认课程。'
  if (lower.includes('permission denied') || lower.includes('forbidden') || lower.startsWith('no permission to')) return '当前账号无权访问该数据。'
  if (lower.includes('unauthorized')) return '登录状态已失效，请重新登录。'
  if (lower === 'not found' || lower.endsWith(' not found')) return '未找到对应资源。'
  return known[normalized] || normalized || '请求失败，请稍后重试。'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${apiBaseURL}${path}`, {
    ...options,
    headers
  })
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | T | null

  if (!response.ok) {
    const envelope = payload as ApiEnvelope<T> | null
    const message = envelope?.message || stringifyDetail(envelope?.detail)
    throw new Error(toChineseMessage(message || `HTTP ${response.status}`))
  }

  if (payload && typeof payload === 'object' && 'code' in payload && 'data' in payload) {
    const envelope = payload as ApiEnvelope<T>
    if (envelope.code !== 0) {
      throw new Error(toChineseMessage(envelope.message || '请求失败。'))
    }
    return envelope.data as T
  }

  return payload as T
}

export function login(payload: { username: string; password: string }) {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function register(payload: { username: string; email: string; password: string; full_name?: string; role: UserRole }) {
  return request<ExternalUser>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function getUsers(params: { page?: number; page_size?: number } = {}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  return request<UserListResponse>(`/users${query.size ? `?${query.toString()}` : ''}`)
}

export function updateUserStatus(userId: number, isActive: boolean) {
  return request<ExternalUser>(`/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive })
  })
}

export function getLLMStatus() {
  return request<LLMStatus>('/llm/status')
}
