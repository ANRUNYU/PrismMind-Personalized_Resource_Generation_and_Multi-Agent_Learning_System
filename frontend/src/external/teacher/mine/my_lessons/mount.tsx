import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import ExternalTeacherCourses from './ExternalTeacherCourses'

export function mountTeacherCourses(container: HTMLElement) {
  let root: Root | null = createRoot(container)
  root.render(<ExternalTeacherCourses />)

  return () => {
    root?.unmount()
    root = null
  }
}
