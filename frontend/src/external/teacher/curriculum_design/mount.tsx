import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { ExternalTeacherCurriculumDesign } from './CurriculumDesignPage'

export function mountTeacherCurriculumDesign(container: HTMLElement) {
  let root: Root | null = createRoot(container)
  root.render(<ExternalTeacherCurriculumDesign />)

  return () => {
    root?.unmount()
    root = null
  }
}
