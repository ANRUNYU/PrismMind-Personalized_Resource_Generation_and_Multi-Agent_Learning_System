import { useEffect, useRef, useState } from "react"
import gsap from "gsap"

import PrismMindLogo from "../Brand/PrismMindLogo.jsx"
import "./TopNav.css"

export default function TopNav() {
  const [userOpen, setUserOpen] = useState(false)
  const navRef = useRef(null)

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(
        navRef.current,
        { autoAlpha: 0, y: -10 },
        { autoAlpha: 1, y: 0, duration: 0.72, ease: "power3.out" }
      )
    }, navRef)

    return () => context.revert()
  }, [])

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!navRef.current?.contains(event.target)) {
        setUserOpen(false)
      }
    }

    window.addEventListener("click", handleDocumentClick)
    return () => window.removeEventListener("click", handleDocumentClick)
  }, [])

  const handleHome = () => {
    window.location.assign("/student/dashboard")
  }

  const handleBack = () => {
    window.location.assign("/student/dashboard")
  }

  const handleUser = () => {
    setUserOpen((current) => !current)
  }

  const handleLogout = () => {
    const prefixes = ["prismmind_", "edugenie_"]
    const directKeys = ["access_token", "refresh_token"]
    for (const storage of [window.localStorage, window.sessionStorage]) {
      directKeys.forEach((key) => storage.removeItem(key))
      Object.keys(storage)
        .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
        .forEach((key) => storage.removeItem(key))
    }
    window.location.assign("/auth/login")
  }

  return (
    <header className="top-nav" ref={navRef}>
      <button
        className="top-brand"
        type="button"
        aria-label="棱镜智教首页"
        onClick={handleHome}
      >
        <PrismMindLogo />
        <span className="top-brand-name">
          <strong>棱镜智教</strong>
          <em>学习资源中心</em>
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
            <span>学习资源中心</span>
            <small>个性化资源生成与归档</small>
          </div>
        ) : null}
      </div>
    </header>
  )
}
