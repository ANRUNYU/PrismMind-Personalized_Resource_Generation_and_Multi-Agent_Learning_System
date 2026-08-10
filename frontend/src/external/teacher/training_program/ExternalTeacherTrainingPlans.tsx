import { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import trainingProgramCss from './TrainingProgramPage.css?raw'
import knowledgeDocumentSelectCss from '../../shared/knowledge-document-multi-select.css?raw'
import teacherKnowledgeSourceCss from '../shared/teacher-knowledge-source.css?raw'
import TrainingProgramPage from './TrainingProgramPage'

function buildStyles() {
  return `
    ${trainingProgramCss}
    ${knowledgeDocumentSelectCss}
    ${teacherKnowledgeSourceCss}
    :host {
      height: auto !important;
      min-height: 100vh !important;
      min-height: 100dvh !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
    }
    .teacher-workbench-page {
      transform: none !important;
      height: auto !important;
      min-height: 100vh !important;
      min-height: 100dvh !important;
      overflow-x: hidden !important;
      overflow-y: visible !important;
    }
    .workbench-shell {
      height: auto !important;
      min-height: calc(100vh - var(--header-height)) !important;
      min-height: calc(100dvh - var(--header-height)) !important;
      overflow: visible !important;
      padding-bottom: 32px !important;
    }
    .workbench-layout,
    .workbench-stack {
      overflow: visible !important;
    }
    .workbench-layout {
      align-items: start !important;
    }
    .workbench-stack {
      height: auto !important;
    }
    .workbench-panel,
    .training-result-panel {
      max-width: 100% !important;
    }
    .field-grid {
      max-height: none !important;
      overflow: visible !important;
    }
    @media (max-width: 1280px) {
      .workbench-layout {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    }
  `
}

export function ExternalTeacherTrainingPlans() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = ''

    const style = document.createElement('style')
    style.textContent = buildStyles()
    const mount = document.createElement('div')
    mount.setAttribute('data-testid', 'external-teacher-training-program-mount')
    shadowRoot.append(style, mount)

    let root: Root | null = createRoot(mount)
    root.render(<TrainingProgramPage />)

    return () => {
      root?.unmount()
      root = null
      shadowRoot.innerHTML = ''
    }
  }, [])

  return <div ref={hostRef} className="external-teacher-training-program-host" data-testid="external-teacher-training-program-host" />
}
