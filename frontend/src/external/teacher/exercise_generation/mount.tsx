import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { ExternalTeacherExercises } from './ExternalTeacherExercises'

export function mountTeacherExercises(container: HTMLElement) {
  let root: Root | null = createRoot(container)
  root.render(<ExternalTeacherExercises />)

  return () => {
    root?.unmount()
    root = null
  }
}
