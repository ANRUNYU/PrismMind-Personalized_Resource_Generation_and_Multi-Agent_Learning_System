import type { PropsWithChildren, ReactNode } from 'react'

import './change-pages.css'

interface ChangePageProps extends PropsWithChildren {
  testId: string
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}

export function ChangePage({ testId, eyebrow, title, description, actions, children }: ChangePageProps) {
  return (
    <section className="change-page" data-testid={testId}>
      <div className="change-prism-bg" aria-hidden="true" />
      <header className="change-hero">
        <div>
          <span className="change-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="change-hero__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}

export function ChangeCard({
  title,
  subtitle,
  children,
  actions,
  className = ''
}: PropsWithChildren<{ title?: string; subtitle?: string; actions?: ReactNode; className?: string }>) {
  return (
    <article className={`change-card ${className}`}>
      {(title || subtitle || actions) && (
        <header className="change-card__header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="change-card__actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </article>
  )
}

export function ChangeButton({
  children,
  variant = 'default',
  disabled,
  type = 'button',
  onClick
}: PropsWithChildren<{
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
  disabled?: boolean
  type?: 'button' | 'submit'
  onClick?: () => void
}>) {
  return (
    <button className={`change-button change-button--${variant}`} disabled={disabled} type={type} onClick={onClick}>
      {children}
    </button>
  )
}

export function ChangeStatus({ value }: { value?: string | null }) {
  return <span className={`change-status change-status--${value || 'default'}`}>{value || '未知'}</span>
}

export function ChangeEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="change-empty">
      <div className="change-empty__lens" />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

export function ChangeError({ message }: { message?: string | null }) {
  if (!message) return null
  return <div className="change-error">{message}</div>
}

export function ChangeLoading({ message = '正在加载' }: { message?: string }) {
  return (
    <div className="change-loading" data-testid="external-loading">
      <span />
      <p>{message}</p>
    </div>
  )
}

export function QualityBlock({ analysis }: { analysis?: any }) {
  if (!analysis) return null
  return (
    <div className="change-quality">
      <div>
        <strong>覆盖度</strong>
        <span>{Math.round(Number(analysis.coverage?.coverage_rate || 0) * 100)}%</span>
      </div>
      <div>
        <strong>深度</strong>
        <span>{analysis.depth?.score ?? '-'}</span>
      </div>
      <div>
        <strong>置信度</strong>
        <span>{analysis.confidence?.level || '-'}</span>
      </div>
      {Array.isArray(analysis.suggestions) && analysis.suggestions.length ? (
        <p>{analysis.suggestions.slice(0, 2).join('；')}</p>
      ) : null}
    </div>
  )
}
