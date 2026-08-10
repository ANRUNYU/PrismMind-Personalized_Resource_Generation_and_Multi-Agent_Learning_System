import { useEffect, useRef, useState, type ReactNode } from 'react'

import './task-stream-panel.css'

export type GenerationProgressState = 'idle' | 'running' | 'success' | 'error'
export type GenerationProgressVariant = 'teacher' | 'student' | 'compact'

interface GenerationProgressProps {
  visible: boolean
  title: string
  statusText: string
  percent: number
  subtitle?: string
  state?: GenerationProgressState
  variant?: GenerationProgressVariant
  className?: string
  dataTestId?: string
  children?: ReactNode
}

export function GenerationProgress({
  visible,
  title,
  statusText,
  percent,
  subtitle,
  state = 'running',
  variant = 'teacher',
  className = '',
  dataTestId = 'generation-progress',
  children
}: GenerationProgressProps) {
  if (!visible) return null

  const normalizedPercent = Math.round(Math.max(0, Math.min(100, Number(percent) || 0)))
  const classes = [
    'generation-progress',
    `generation-progress--${variant}`,
    className
  ].filter(Boolean).join(' ')

  return (
    <section
      className={classes}
      aria-live="polite"
      data-state={state}
      data-testid={dataTestId}
    >
      <header className="generation-progress__header">
        <div className="generation-progress__heading">
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        <span className="generation-progress__percent">{normalizedPercent}%</span>
      </header>
      <div
        className="generation-progress__track"
        role="progressbar"
        aria-label={`${title}生成进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedPercent}
      >
        <span
          className="generation-progress__fill"
          style={{ transform: `scaleX(${normalizedPercent / 100})` }}
        />
      </div>
      <p className="generation-progress__status">{statusText}</p>
      {children ? <div className="generation-progress__details">{children}</div> : null}
    </section>
  )
}

interface SimulatedProgressOptions {
  active: boolean
  failed?: boolean
  resetKey?: string | number
  initialPercent?: number
  ceiling?: number
  completionDelay?: number
}

export function useSimulatedGenerationProgress({
  active,
  failed = false,
  resetKey,
  initialPercent = 8,
  ceiling = 94,
  completionDelay = 1800
}: SimulatedProgressOptions) {
  const [snapshot, setSnapshot] = useState({
    visible: false,
    percent: 0,
    state: 'idle' as GenerationProgressState
  })
  const wasActive = useRef(false)
  const hideTimer = useRef<number | null>(null)

  useEffect(() => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }

    let progressTimer: number | null = null

    if (active) {
      if (!wasActive.current) {
        setSnapshot({ visible: true, percent: initialPercent, state: 'running' })
      } else {
        setSnapshot((current) => ({ ...current, visible: true, state: 'running' }))
      }
      wasActive.current = true
      progressTimer = window.setInterval(() => {
        setSnapshot((current) => {
          if (current.state !== 'running') return current
          const increment = current.percent < 36 ? 4 : current.percent < 68 ? 2 : current.percent < 84 ? 1 : 0.5
          return { ...current, percent: Math.min(ceiling, current.percent + increment) }
        })
      }, 480)
    } else if (wasActive.current) {
      wasActive.current = false
      setSnapshot({ visible: true, percent: 100, state: failed ? 'error' : 'success' })
      hideTimer.current = window.setTimeout(() => {
        setSnapshot({ visible: false, percent: 0, state: 'idle' })
      }, completionDelay)
    }

    return () => {
      if (progressTimer) window.clearInterval(progressTimer)
    }
  }, [active, ceiling, completionDelay, failed, initialPercent, resetKey])

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
  }, [])

  if (active) {
    return {
      visible: true,
      percent: snapshot.state === 'running' ? Math.max(initialPercent, snapshot.percent) : initialPercent,
      state: 'running' as GenerationProgressState
    }
  }

  return snapshot
}
