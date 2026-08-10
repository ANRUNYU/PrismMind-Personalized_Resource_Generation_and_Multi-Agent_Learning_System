import { useEffect, useRef, useState } from 'react'

import {
  clearSession,
  getCurrentUser,
  getRefreshToken,
  getToken,
  isSupportedRole,
  loadingLoginPath,
  loadingTargetFor,
  persistUser,
  refreshSession
} from './loadingAdapter.js'
import LoadingTransition from './LoadingTransition.jsx'

const MINIMUM_VISIBLE_MS = 760

function waitForMinimum(startedAt) {
  const remaining = Math.max(0, MINIMUM_VISIBLE_MS - (performance.now() - startedAt))
  return new Promise((resolve) => {
    window.setTimeout(resolve, remaining)
  })
}

export default function ExternalPrismLoading() {
  const mountedRef = useRef(false)
  const [status, setStatus] = useState('正在确认登录状态')

  useEffect(() => {
    mountedRef.current = true
    document.title = '棱镜智教-PrismMind'

    const redirectTo = async (path, startedAt) => {
      await waitForMinimum(startedAt)
      if (mountedRef.current) {
        window.location.assign(path)
      }
    }

    const resolveSession = async () => {
      const startedAt = performance.now()

      try {
        let accessToken = getToken()

        if (!accessToken && getRefreshToken()) {
          setStatus('正在刷新登录状态')
          accessToken = await refreshSession()
        }

        if (!accessToken) {
          clearSession()
          setStatus('请先登录后继续')
          await redirectTo(loadingLoginPath(), startedAt)
          return
        }

        setStatus('正在读取账号信息')
        let user
        try {
          user = await getCurrentUser(accessToken)
        } catch (error) {
          if (!getRefreshToken()) throw error
          setStatus('正在刷新登录状态')
          accessToken = await refreshSession()
          user = await getCurrentUser(accessToken)
        }

        if (!user || !isSupportedRole(user.role)) {
          clearSession()
          setStatus('账号状态异常，请重新登录')
          await redirectTo(loadingLoginPath(), startedAt)
          return
        }

        persistUser(user)
        setStatus('正在进入工作台')
        await redirectTo(loadingTargetFor(user.role), startedAt)
      } catch {
        clearSession()
        setStatus('登录状态已失效，请重新登录')
        await redirectTo(loadingLoginPath(), startedAt)
      }
    }

    resolveSession()

    return () => {
      mountedRef.current = false
    }
  }, [])

  return (
    <main className="external-loading-page" data-testid="external-loading-page">
      <LoadingTransition active status={status} testId="external-loading-visual" />
    </main>
  )
}
