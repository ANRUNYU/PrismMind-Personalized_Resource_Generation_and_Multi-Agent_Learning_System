import type { ButtonHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from 'react'

import './common.css'

interface GlassPanelProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  children: ReactNode
}

export function GlassPanel({ as: Component = 'section', className = '', children, ...props }: GlassPanelProps) {
  return (
    <Component className={`student-glass-panel ${className}`} {...props}>
      {children}
    </Component>
  )
}

interface StudentButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
}

export function PrimaryButton({ className = '', children, isLoading = false, disabled, ...props }: StudentButtonProps) {
  return (
    <button className={`student-primary-button ${className}`} type="button" disabled={isLoading || disabled} {...props}>
      {isLoading ? <span className="student-loading-dots" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  )
}

export function SecondaryButton({ className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`student-secondary-button ${className}`} type="button" {...props}>
      {children}
    </button>
  )
}

interface ModalProps {
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  className?: string
  labelledBy?: string
}

export function Modal({ title, children, footer, onClose, className = '', labelledBy }: ModalProps) {
  const titleId = labelledBy || `student-modal-${String(title).replace(/\s+/g, '-')}`

  return (
    <div className={`student-modal-layer ${className}`} role="presentation">
      <section className="student-modal" role="dialog" aria-modal="false" aria-labelledby={titleId}>
        <header className="student-modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="student-modal-close" type="button" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="student-modal-body">{children}</div>
        {footer ? <footer className="student-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
