import { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import exercisePageCss from './ExerciseGenerationPage.css?raw'
import generationWorkbenchCss from './GenerationWorkbench.css?raw'
import prismBackgroundCss from './PrismBackground.css?raw'
import referenceFilePickerCss from './ReferenceFilePicker.css?raw'
import sharedTopNavCss from './SharedTopNav.css?raw'
import baseStylesCss from './styles.css?raw'
import knowledgeDocumentSelectCss from '../../shared/knowledge-document-multi-select.css?raw'
import teacherKnowledgeSourceCss from '../shared/teacher-knowledge-source.css?raw'
import ExerciseGenerationPage from './ExerciseGenerationPage'

const exerciseThemeVars = `
  --font-family-base: Inter, "HarmonyOS Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --header-height: 72px;
  --nav-height: 72px;
  --page-max-width: 1680px;
  --page-padding-x: clamp(44px, 5.8vw, 96px);
  --page-padding-y: 18px;
  --page-gap: 16px;
  --panel-radius: 14px;
  --control-radius: 8px;
  --panel-border: 1px solid rgba(43, 83, 92, 0.14);
  --panel-shadow: 0 14px 30px rgba(38, 62, 66, 0.075);
  --color-text-main: #143943;
  --color-text-body: #315b65;
  --color-text-muted: rgba(49, 91, 101, 0.68);
  --color-primary: #174f63;
  --color-primary-strong: #0e4156;
  --color-accent: #2cb8c6;
  --color-blue: #2467d8;
  --surface-page: #f5f2ea;
  --surface-panel: rgba(255, 255, 255, 0.82);
  --surface-panel-strong: rgba(255, 255, 255, 0.94);
  --text-title: 2.62rem;
  --text-subtitle: 0.98rem;
  --text-body: 0.92rem;
  --text-label: 0.86rem;
  --text-small: 0.8rem;
`

function buildStyles() {
  return `
    :host {
      ${exerciseThemeVars}
      display: block;
      position: relative;
      width: 100%;
      min-width: 0;
      min-height: 100vh;
      min-height: 100dvh;
      overflow-x: hidden;
      background: #f5f2ea;
    }
    .teacher-workbench-page {
      ${exerciseThemeVars}
    }
    ${baseStylesCss}
    ${sharedTopNavCss}
    ${generationWorkbenchCss}
    ${prismBackgroundCss}
    ${referenceFilePickerCss}
    ${knowledgeDocumentSelectCss}
    ${teacherKnowledgeSourceCss}
    ${exercisePageCss}
    .teacher-workbench-page {
      width: 100% !important;
      min-width: 0 !important;
      height: auto !important;
      min-height: 100vh !important;
      min-height: 100dvh !important;
      overflow-x: hidden !important;
      overflow-y: visible !important;
    }
    .workbench-shell {
      height: auto !important;
      min-height: calc(100vh - var(--header-height)) !important;
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
    .workbench-panel--result,
    .exercise-preview-result {
      min-height: 0 !important;
    }
    .field-grid {
      max-height: none !important;
      overflow: visible !important;
    }
    .exercise-markdown {
      display: grid;
      gap: 8px;
      max-height: 360px;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      color: var(--color-text-body);
      border: 1px solid rgba(43, 83, 92, 0.12);
      border-radius: var(--control-radius);
      background: rgba(255, 255, 255, 0.58);
      font-size: 0.9rem;
      line-height: 1.56;
      overflow-wrap: anywhere;
    }
    .exercise-markdown h2,
    .exercise-markdown h3,
    .exercise-markdown h4 {
      margin: 6px 0 2px;
      color: var(--color-text-main);
      line-height: 1.3;
    }
    .exercise-markdown p {
      margin: 0;
    }
    .quality-panel {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      padding: 10px;
      border: 1px solid rgba(43, 83, 92, 0.12);
      border-radius: var(--control-radius);
      background: rgba(237, 249, 248, 0.62);
    }
    .quality-panel > div {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .quality-panel span {
      color: var(--color-text-muted);
      font-size: var(--text-small);
      font-weight: 700;
    }
    .quality-panel strong {
      color: var(--color-primary-strong);
      font-size: 1.02rem;
      font-weight: 860;
    }
    .quality-panel p {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--color-text-body);
      font-size: var(--text-small);
      line-height: 1.45;
    }
    .reference-result-list {
      display: grid;
      gap: 10px;
    }
    .reference-result-list article,
    .history-list a {
      display: block;
      color: inherit;
      text-decoration: none;
    }
    .reference-result-list article {
      margin-top: 7px;
      padding: 9px 10px;
      border: 1px solid rgba(43, 83, 92, 0.1);
      border-radius: var(--control-radius);
      background: rgba(255, 255, 255, 0.52);
    }
    .reference-result-list p,
    .reference-result-list ul {
      margin: 4px 0 0;
      color: var(--color-text-muted);
      font-size: var(--text-small);
      line-height: 1.45;
    }
    .history-list {
      display: grid;
      gap: 8px;
    }
    .history-list a {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      border: 1px solid rgba(43, 83, 92, 0.12);
      border-radius: var(--control-radius);
      background: rgba(255, 255, 255, 0.62);
    }
    .history-list span,
    .history-list small {
      color: var(--color-text-muted);
      font-size: var(--text-small);
    }
    .history-list strong {
      color: var(--color-text-main);
      font-size: 0.94rem;
      line-height: 1.34;
    }
    .exercise-result-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 4px;
    }
    .exercise-result-actions .panel-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }
    .exercise-prism-background canvas {
      width: 100% !important;
      height: 100% !important;
    }
    @media (max-width: 1280px) {
      .workbench-layout {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    }
    @media (max-width: 820px) {
      .quality-panel {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `
}

export function ExternalTeacherExercises() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = ''

    const style = document.createElement('style')
    style.textContent = buildStyles()
    const mount = document.createElement('div')
    mount.setAttribute('data-testid', 'external-teacher-exercise-generation-mount')
    shadowRoot.append(style, mount)

    let root: Root | null = createRoot(mount)
    root.render(<ExerciseGenerationPage />)

    return () => {
      root?.unmount()
      root = null
      shadowRoot.innerHTML = ''
    }
  }, [])

  return <div ref={hostRef} className="external-teacher-exercise-generation-host" data-testid="external-teacher-exercise-generation-host" />
}
