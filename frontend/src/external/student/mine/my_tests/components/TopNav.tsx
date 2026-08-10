import { useEffect, useRef, useState } from 'react'

import { getStoredUser, type UserInfo } from '@/utils/storage'

import PrismMindLogo from './PrismMindLogo'
import './top-nav.css'
import { lerp } from '../motion/motionEngine'

function removeSessionKeys(storage: Storage) {
  const exactKeys = new Set(['access_token', 'refresh_token'])
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index)
    if (!key) continue
    if (exactKeys.has(key) || key.startsWith('prismmind_') || key.startsWith('edugenie_')) {
      storage.removeItem(key)
    }
  }
}

function clearSessionAndGoLogin() {
  removeSessionKeys(window.localStorage)
  removeSessionKeys(window.sessionStorage)
  window.sessionStorage.clear()
  window.location.assign('/auth/login')
}

function getDisplayName(user: UserInfo | null) {
  if (!user) return '学生'
  return user.full_name || user.username || (user.email ? user.email.split('@')[0] : '学生')
}

function getRoleLabel(user: UserInfo | null) {
  if (user?.role === 'student') return '学生课程空间'
  if (user?.role === 'teacher') return '授课成员'
  if (user?.role === 'admin') return '管理成员'
  return '课程学习空间'
}

export default function TopNav() {
  const [userOpen, setUserOpen] = useState(false)
  const [userInfo] = useState<UserInfo | null>(() => getStoredUser())
  const navRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = navRef.current
    if (!element) return undefined

    let frameId = 0
    const current = { opacity: 0, y: -10 }
    const target = { opacity: 1, y: 0 }

    function render() {
      if (!element) return
      current.opacity = lerp(current.opacity, target.opacity, 0.14)
      current.y = lerp(current.y, target.y, 0.14)
      element.style.opacity = String(current.opacity)
      element.style.transform = `translate3d(0, ${current.y}px, 0)`

      if (Math.abs(target.opacity - current.opacity) > 0.002 || Math.abs(target.y - current.y) > 0.02) {
        frameId = window.requestAnimationFrame(render)
        return
      }

      element.style.opacity = '1'
      element.style.transform = 'translate3d(0, 0, 0)'
    }

    frameId = window.requestAnimationFrame(render)
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setUserOpen(false)
      }
    }

    window.addEventListener('click', handleDocumentClick)
    return () => window.removeEventListener('click', handleDocumentClick)
  }, [])

  return (
    <header className="top-nav" ref={navRef}>
      <button
        className="top-brand"
        type="button"
        aria-label="棱镜智教-PrismMind 首页"
        onClick={() => window.location.assign('/student/dashboard')}
      >
        <PrismMindLogo />
        <span className="top-brand-name">
          <strong>棱镜智教</strong>
          <em>PrismMind</em>
        </span>
      </button>

      <div className="top-nav-left">
        <button className="top-nav-button is-active" type="button" onClick={() => window.location.assign('/student/dashboard')}>
          首页
        </button>
        <button className="top-nav-button" type="button" onClick={() => window.history.back()}>
          返回
        </button>
      </div>

      <div className="top-nav-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="top-nav-right">
        <button className="top-nav-button" type="button" onClick={() => setUserOpen((current) => !current)}>
          用户
        </button>
        <button className="top-nav-button" type="button" onClick={clearSessionAndGoLogin}>
          退出
        </button>
        {userOpen ? (
          <div className="top-user-popover">
            <span>{getDisplayName(userInfo)}</span>
            <small>{getRoleLabel(userInfo)}</small>
          </div>
        ) : null}
      </div>
    </header>
  )
}
