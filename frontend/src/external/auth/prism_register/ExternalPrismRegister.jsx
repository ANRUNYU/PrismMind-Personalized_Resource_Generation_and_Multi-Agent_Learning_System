import { useEffect, useRef, useState } from 'react'

import LoadingTransition from '../loading/LoadingTransition.jsx'
import LensBackground from '../../prism_admin/auth/LensBackground.jsx'
import RegisterView from './RegisterView.jsx'
import './prism-register.css'

export default function ExternalPrismRegister() {
  const containerRef = useRef(null)
  const pointerTargetRef = useRef({ x: 0, y: 0, strength: 1 })
  const transitionTimersRef = useRef([])
  const [isTransitioning, setIsTransitioning] = useState(false)

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

  function navigateToLogin() {
    setIsTransitioning(true)
    const timer = window.setTimeout(() => {
      window.location.assign('/auth/login')
    }, 360)
    transitionTimersRef.current = [timer]
  }

  return (
    <main
      className="external-register-page hero hero-register"
      data-testid="external-register-page"
      ref={containerRef}
    >
      <LensBackground pointerTargetRef={pointerTargetRef} variant="register" />

      <RegisterView
        onBackToLogin={navigateToLogin}
        onTransitionChange={setIsTransitioning}
      />

      <LoadingTransition active={isTransitioning} />
    </main>
  )
}
