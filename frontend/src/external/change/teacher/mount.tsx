import React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import TeacherGenerationWorkbench, { type TeacherExternalGenerationPage } from './TeacherGenerationWorkbench'

export type { TeacherExternalGenerationPage }

export function mountTeacherExternalPage(container: HTMLElement, page: TeacherExternalGenerationPage) {
  let root: Root | null = createRoot(container)
  root.render(<TeacherGenerationWorkbench page={page} />)

  return () => {
    root?.unmount()
    root = null
  }
}
