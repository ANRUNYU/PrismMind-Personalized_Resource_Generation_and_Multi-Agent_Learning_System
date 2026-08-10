import type { ReactNode } from 'react'

import StudentPrismScene from '../PrismScene/StudentPrismScene.jsx'
import StudentTopNav from '../StudentTopNav/StudentTopNav.jsx'
import './PageShell.css'

interface PageShellProps {
  children: ReactNode
  className?: string
  navUserLabel?: string
  navUserDescription?: string
  prismVariant?: 'left' | 'right' | 'center' | string
}

export default function PageShell({
  children,
  className = '',
  navUserLabel,
  navUserDescription,
  prismVariant = 'right'
}: PageShellProps) {
  return (
    <main className={`student-page-shell ${className}`}>
      <StudentTopNav userLabel={navUserLabel} userDescription={navUserDescription} />
      <StudentPrismScene variant={prismVariant} />
      <div className="student-prism-field" aria-hidden="true">
        <span className="student-orbit student-orbit-a" />
        <span className="student-orbit student-orbit-b" />
        <span className="student-circuit-line student-circuit-line-a" />
        <span className="student-circuit-line student-circuit-line-b" />
        <span className="student-dot-matrix" />
      </div>
      <div className="student-shell-content">{children}</div>
    </main>
  )
}
