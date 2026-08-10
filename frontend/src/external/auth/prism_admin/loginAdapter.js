import { resolveApiBaseURL } from '@/api/baseUrl'

const TOKEN_KEY = 'edugenie_access_token'
const REFRESH_TOKEN_KEY = 'edugenie_refresh_token'
const USER_KEY = 'edugenie_user_info'

export const apiBaseURL = resolveApiBaseURL()

export function persistSession(data) {
  localStorage.setItem(TOKEN_KEY, data.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
}

export function roleHomePath(role) {
  if (role === 'teacher') return '/teacher/dashboard'
  if (role === 'student') return '/student/dashboard'
  if (role === 'admin') return '/admin/dashboard'
  return '/auth/login'
}

export function loginTargetFor(role) {
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

function toLoginMessage(message, status) {
  const normalized = String(message || '').trim()
  const lower = normalized.toLowerCase()
  if (lower.includes('身份') || lower.includes('role mismatch')) {
    return '所选登录身份与账号角色不匹配，请切换为正确身份。'
  }
  if (status === 401 || lower.includes('incorrect') || lower.includes('invalid') || lower.includes('unauthorized')) {
    return '账号或密码不正确，请重新输入。'
  }
  if (status === 400 || status === 422 || lower.includes('validation')) {
    return '请检查用户名和密码后再试。'
  }
  if (status === 403 || lower.includes('inactive') || lower.includes('disabled')) {
    return '当前账号无法登录，请联系管理员。'
  }
  if (status >= 500) return '服务暂时不可用，请稍后重试。'
  return normalized || '登录失败，请稍后重试。'
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
    throw new Error(toLoginMessage(message, response.status))
  }

  if (envelope && 'code' in envelope && 'data' in envelope) {
    if (envelope.code !== 0) {
      throw new Error(toLoginMessage(envelope.message, response.status))
    }
    return envelope.data
  }

  return payload
}

export function login(payload) {
  return requestJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}
