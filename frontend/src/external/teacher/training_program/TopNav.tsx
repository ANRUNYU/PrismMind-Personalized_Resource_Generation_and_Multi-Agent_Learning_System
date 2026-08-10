import { useEffect, useRef, useState } from 'react'

function PrismMindLogo() {
  return (
    <span className="teacher-brand-icon" aria-hidden="true">
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

export default function TopNav({ homeHref = '/teacher/dashboard' }: { homeHref?: string }) {
  const [userOpen, setUserOpen] = useState(false)
  const navRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const path = event.composedPath()
      if (navRef.current && !path.includes(navRef.current)) {
        setUserOpen(false)
      }
    }
    window.addEventListener('click', handleDocumentClick)
    return () => window.removeEventListener('click', handleDocumentClick)
  }, [])

  const handleLogout = () => {
    clearAuthStorage()
    window.location.assign('/auth/login')
  }

  return (
    <header className="top-nav" ref={navRef}>
      <button className="top-brand" type="button" aria-label="棱镜智教 PrismMind 首页" onClick={() => window.location.assign(homeHref)}>
        <PrismMindLogo />
        <span className="top-brand-name">
          <strong>棱镜智教</strong>
          <em>PrismMind</em>
        </span>
      </button>

      <div className="top-nav-left">
        <button className="top-nav-button is-active" type="button" onClick={() => window.location.assign(homeHref)}>
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
        <button className="top-nav-button" type="button" onClick={handleLogout}>
          退出
        </button>
        {userOpen ? (
          <div className="top-user-popover">
            <span>棱镜智教-PrismMind</span>
            <small>Training program console</small>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function clearAuthStorage() {
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
  ;[localStorage, sessionStorage].forEach((storage) => {
    exactKeys.forEach((key) => storage.removeItem(key))
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (key?.startsWith('prismmind_') || key?.startsWith('edugenie_')) {
        storage.removeItem(key)
      }
    }
  })
}
