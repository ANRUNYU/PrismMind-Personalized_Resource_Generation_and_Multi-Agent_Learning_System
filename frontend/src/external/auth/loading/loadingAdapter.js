import { resolveApiBaseURL } from '@/api/baseUrl'

const TOKEN_KEY = 'edugenie_access_token'
const REFRESH_TOKEN_KEY = 'edugenie_refresh_token'
const USER_KEY = 'edugenie_user_info'

export const apiBaseURL = resolveApiBaseURL()

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || ''
}

export function persistToken(accessToken, refreshToken = getRefreshToken()) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
}

export function persistUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function roleHomePath(role) {
  if (role === 'teacher') return '/teacher/dashboard'
  if (role === 'student') return '/student/dashboard'
  if (role === 'admin') return '/admin/dashboard'
  return '/auth/login'
}

export function loadingTargetFor(role) {
  const defaultPath = roleHomePath(role)
  const redirect = new URLSearchParams(window.location.search).get('redirect')
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('/auth/')) return defaultPath
  if (role === 'teacher' && redirect.startsWith('/teacher/')) return redirect
  if (role === 'student' && redirect.startsWith('/student/')) return redirect
  if (role === 'admin' && redirect.startsWith('/admin/')) return redirect
  if (redirect === '/assistant' || redirect.startsWith('/assistant/')) return redirect
  if (redirect === '/tasks' || redirect.startsWith('/tasks/')) return redirect
  return defaultPath
}

export function loadingLoginPath() {
  const redirect = new URLSearchParams(window.location.search).get('redirect')
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('/auth/')) return '/auth/login'
  return `/auth/login?redirect=${encodeURIComponent(redirect)}`
}

export function isSupportedRole(role) {
  return role === 'teacher' || role === 'student' || role === 'admin'
}

function stringifyDetail(detail) {
  if (!detail) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object') {
          const loc = Array.isArray(item.loc) ? item.loc.join('.') : ''
          return [loc, item.msg].filter(Boolean).join(': ')
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

function toLoadingMessage(message, status) {
  const normalized = String(message || '').trim()
  const lower = normalized.toLowerCase()
  if (status === 401 || lower.includes('unauthorized') || lower.includes('invalid')) {
    return '登录状态已失效，请重新登录。'
  }
  if (status === 403 || lower.includes('inactive') || lower.includes('disabled')) {
    return '当前账号无法进入，请联系管理员。'
  }
  if (status >= 500) return '服务暂时不可用，请稍后重试。'
  return normalized || '登录状态校验失败，请重新登录。'
}

async function requestJson(path, options = {}) {
  let response
  try {
    response = await fetch(`${apiBaseURL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    })
  } catch {
    throw new Error('网络连接暂时不稳定，请稍后重试。')
  }

  const payload = await response.json().catch(() => null)
  const envelope = payload && typeof payload === 'object' ? payload : null

  if (!response.ok) {
    const message = envelope?.message || stringifyDetail(envelope?.detail)
    throw new Error(toLoadingMessage(message, response.status))
  }

  if (envelope && 'code' in envelope && 'data' in envelope) {
    if (envelope.code !== 0) {
      throw new Error(toLoadingMessage(envelope.message, response.status))
    }
    return envelope.data
  }

  return payload
}

export async function refreshSession() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return ''

  const data = await requestJson('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken })
  })
  const accessToken = data?.access_token || ''
  if (!accessToken) throw new Error('登录状态已失效，请重新登录。')

  persistToken(accessToken, data?.refresh_token || refreshToken)
  return accessToken
}

export function getCurrentUser(accessToken) {
  return requestJson('/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
}
