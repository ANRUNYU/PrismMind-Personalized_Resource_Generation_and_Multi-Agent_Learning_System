import { resolveApiBaseURL } from '@/api/baseUrl'

export const apiBaseURL = resolveApiBaseURL()

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

function toRegisterMessage(message, status) {
  const normalized = String(message || '').trim()
  const lower = normalized.toLowerCase()

  if (
    status === 409 ||
    lower.includes('already exists') ||
    lower.includes('duplicate') ||
    lower.includes('unique')
  ) {
    return '用户已存在，请更换用户名或邮箱。'
  }
  if (status === 400 || status === 422 || lower.includes('validation') || lower.includes('invalid')) {
    return '请检查用户名、邮箱、密码和身份后再试。'
  }
  if (status >= 500) return '服务暂时不可用，请稍后重试。'
  return normalized || '注册失败，请稍后重试。'
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
    throw new Error(toRegisterMessage(message, response.status))
  }

  if (envelope && 'code' in envelope && 'data' in envelope) {
    if (envelope.code !== 0) {
      throw new Error(toRegisterMessage(envelope.message, response.status))
    }
    return envelope.data
  }

  return payload
}

export function register(payload) {
  return requestJson('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}
