import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { ExternalTeacherTrainingPlans } from './ExternalTeacherTrainingPlans'

export function mountTeacherTrainingPlans(container: HTMLElement) {
  let root: Root | null = createRoot(container)
  root.render(<ExternalTeacherTrainingPlans />)

  return () => {
    root?.unmount()
    root = null
  }
}
