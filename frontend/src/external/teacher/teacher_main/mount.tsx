import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { ExternalTeacherMain } from './TeacherMainDashboard'

export function mountTeacherMainDashboard(container: HTMLElement) {
  let root: Root | null = createRoot(container)
  root.render(<ExternalTeacherMain />)

  return () => {
    root?.unmount()
    root = null
  }
}
