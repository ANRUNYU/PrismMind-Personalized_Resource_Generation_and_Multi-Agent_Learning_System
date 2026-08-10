/** Resolve an API URL that also works when the UI is opened from another host. */
export function resolveApiBaseURL(configured = import.meta.env.VITE_API_BASE_URL): string {
  const fallback = '/api/v1'
  const value = String(configured || fallback).replace(/\/$/, '')
  if (typeof window === 'undefined' || value.startsWith('/')) return value
  try {
    const url = new URL(value)
    const browserHost = window.location.hostname
    if (['127.0.0.1', 'localhost'].includes(url.hostname) && !['127.0.0.1', 'localhost'].includes(browserHost)) url.hostname = browserHost
    return url.toString().replace(/\/$/, '')
  } catch { return fallback }
}
