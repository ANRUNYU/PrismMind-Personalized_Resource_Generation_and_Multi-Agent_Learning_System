import { useEffect, useRef, useState } from 'react'

function PrismMindLogo({ className = '' }) {
  return (
    <span className={`teacher-brand-icon ${className}`} aria-hidden="true">
      <span className="prism-logo-glow" />
      <span className="prism-logo-core">
        <span className="prism-logo-facet prism-logo-facet-a" />
        <span className="prism-logo-facet prism-logo-facet-b" />
        <span className="prism-logo-facet prism-logo-facet-c" />
        <span className="prism-logo-facet prism-logo-facet-d" />
        <span className="prism-logo-facet prism-logo-facet-e" />
        <span className="prism-logo-ray prism-logo-ray-a" />
        <span className="prism-logo-ray prism-logo-ray-b" />
        <span className="prism-logo-nucleus" />
      </span>
    </span>
  )
}

export default function TopNav({
  homeHref = '/teacher/dashboard',
  contextLabel = 'Exercise generation console'
}: {
  homeHref?: string
  contextLabel?: string
}) {
  const [userOpen, setUserOpen] = useState(false)
  const navRef = useRef<HTMLElement | null>(null)
  const userLabel = getStoredUserLabel()

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setUserOpen(false)
      }
    }

    window.addEventListener('click', handleDocumentClick)
    return () => window.removeEventListener('click', handleDocumentClick)
  }, [])

  const handleHome = () => {
    window.location.assign(homeHref)
  }

  const handleBack = () => {
    window.history.back()
  }

  const handleUser = () => {
    setUserOpen((current) => !current)
  }

  const handleLogout = () => {
    const exactKeys = [
      'access_token',
      'refresh_token',
      'user_info',
      'teacher_user_info',
      'prismmind_access_token',
      'prismmind_refresh_token',
      'prismmind_user_info',
      'edugenie_access_token',
      'edugenie_refresh_token',
      'edugenie_user_info'
    ]
    exactKeys.forEach((key) => {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    })
    ;[localStorage, sessionStorage].forEach((storage) => {
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => Boolean(key && (key.startsWith('prismmind_') || key.startsWith('edugenie_'))))
        .forEach((key) => storage.removeItem(key))
    })
    window.location.assign('/auth/login')
  }

  return (
    <header className="top-nav" ref={navRef}>
      <button className="top-brand" type="button" aria-label="棱镜智教 PrismMind 首页" onClick={handleHome}>
        <PrismMindLogo />
        <span className="top-brand-name">
          <strong>棱镜智教</strong>
          <em>PrismMind</em>
        </span>
      </button>

      <div className="top-nav-left">
        <button className="top-nav-button is-active" type="button" onClick={handleHome}>
          首页
        </button>
        <button className="top-nav-button" type="button" onClick={handleBack}>
          返回
        </button>
      </div>

      <div className="top-nav-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="top-nav-right">
        <button className="top-nav-button" type="button" onClick={handleUser}>
          用户
        </button>
        <button className="top-nav-button" type="button" onClick={handleLogout}>
          退出
        </button>
        {userOpen ? (
          <div className="top-user-popover">
            <span>{userLabel}</span>
            <small>{contextLabel}</small>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function getStoredUserLabel() {
  const raw =
    localStorage.getItem('edugenie_user_info') ||
    localStorage.getItem('prismmind_user_info') ||
    localStorage.getItem('teacher_user_info') ||
    localStorage.getItem('user_info')

  if (!raw) return '棱镜智教-PrismMind'

  try {
    const user = JSON.parse(raw) as { full_name?: string | null; username?: string | null; email?: string | null }
    return user.full_name || user.username || user.email || '棱镜智教-PrismMind'
  } catch {
    return '棱镜智教-PrismMind'
  }
}
