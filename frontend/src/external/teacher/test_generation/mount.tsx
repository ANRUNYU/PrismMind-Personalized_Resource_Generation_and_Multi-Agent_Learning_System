import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { ExternalTeacherPapers } from './ExternalTeacherPapers'

export function mountTeacherPapers(container: HTMLElement) {
  let root: Root | null = createRoot(container)
  root.render(<ExternalTeacherPapers />)

  return () => {
    root?.unmount()
    root = null
  }
}
