import { useEffect, useMemo, useRef, useState } from 'react'

import LoadingTransition from '../loading/LoadingTransition.jsx'
import LensBackground from '../../prism_admin/auth/LensBackground.jsx'
import AuthPanel from './AuthPanel.jsx'
import './prism-login.css'

export default function ExternalPrismAdminLogin() {
  const containerRef = useRef(null)
  const pointerTargetRef = useRef({ x: 0, y: 0, strength: 1 })
  const transitionTimersRef = useRef([])
  const [isTransitioning, setIsTransitioning] = useState(false)

  const heroCopy = useMemo(
    () => ({
      label: '棱镜智教',
      brand: 'Prism Mind',
      title: '让备课、练习与学习反馈更清晰',
      lede:
        'Prism Mind——课程建设、资源管理与个性化学习综合工作台，帮助师生更专注地完成每一次教学互动'
    }),
    []
  )

  useEffect(() => {
    document.title = '棱镜智教-PrismMind'

    const node = containerRef.current
    if (!node) return undefined

    const handlePointerMove = (event) => {
      const rect = node.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      const target = event.target
      const isInsidePanel =
        target instanceof Element && Boolean(target.closest('.auth-panel-shell'))

      pointerTargetRef.current.x = x
      pointerTargetRef.current.y = y
      pointerTargetRef.current.strength = isInsidePanel ? 0.42 : 1
    }

    const handlePointerLeave = () => {
      pointerTargetRef.current.x = 0
      pointerTargetRef.current.y = 0
      pointerTargetRef.current.strength = 0.72
    }

    node.addEventListener('pointermove', handlePointerMove, { passive: true })
    node.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      node.removeEventListener('pointermove', handlePointerMove)
      node.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  useEffect(
    () => () => {
      transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    },
    []
  )

  function navigateToRegister() {
    setIsTransitioning(true)
    const timer = window.setTimeout(() => {
      window.location.assign('/auth/register')
    }, 360)
    transitionTimersRef.current = [timer]
  }

  return (
    <main className="external-login-page hero" data-testid="external-login-page" ref={containerRef}>
      <LensBackground pointerTargetRef={pointerTargetRef} variant="default" />

      <div className="hero-shell">
        <section className="hero-content" aria-label="Prism Mind introduction">
          <p className="eyebrow">{heroCopy.label}</p>
          <p className="brand-mark">{heroCopy.brand}</p>
          <h1>{heroCopy.title}</h1>
          <p className="lede">{heroCopy.lede}</p>
        </section>

        <AuthPanel
          onCreateAccount={navigateToRegister}
          onTransitionChange={setIsTransitioning}
        />
      </div>

      <LoadingTransition active={isTransitioning} />
    </main>
  )
}
