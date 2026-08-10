import { useEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import examPageCss from './ExamGenerationPage.css?raw'
import generationWorkbenchCss from './GenerationWorkbench.css?raw'
import sharedTopNavCss from './SharedTopNav.css?raw'
import knowledgeDocumentSelectCss from '../../shared/knowledge-document-multi-select.css?raw'
import teacherKnowledgeSourceCss from '../shared/teacher-knowledge-source.css?raw'
import ExamGenerationPage from './ExamGenerationPage'

const paperThemeVars = `
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
      ${paperThemeVars}
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
      ${paperThemeVars}
    }
    ${examPageCss}
    ${sharedTopNavCss}
    ${generationWorkbenchCss}
    ${knowledgeDocumentSelectCss}
    ${teacherKnowledgeSourceCss}
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
    .workbench-panel--history,
    .preview-question {
      min-height: 0 !important;
    }
    .field-grid {
      max-height: none !important;
      overflow: visible !important;
    }
    .paper-reference-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }
    .file-picker-shell {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 9px;
      width: 100%;
      min-width: 0;
      padding: 10px;
      border: 1px dashed rgba(43, 83, 92, 0.18);
      border-radius: var(--control-radius);
      background: rgba(255, 255, 255, 0.5);
    }
    .native-file-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }
    .file-pick-button,
    .file-clear-button {
      border: 0;
      border-radius: var(--control-radius);
      cursor: pointer;
      font-weight: 800;
    }
    .file-pick-button {
      position: relative;
      min-height: 36px;
      padding: 0 16px;
      color: #ffffff;
      background: linear-gradient(135deg, #174f63, #2cb8c6);
      overflow: hidden;
    }
    .file-clear-button {
      min-height: 34px;
      padding: 0 12px;
      color: var(--color-primary);
      background: rgba(23, 79, 99, 0.08);
    }
    .file-state-text {
      min-width: 0;
      color: var(--color-text-muted);
      font-size: var(--text-small);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reference-file-list,
    .paper-preparation-progress ul {
      grid-column: 1 / -1;
      display: grid;
      gap: 6px;
      width: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .reference-file-list li,
    .paper-preparation-progress li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px 12px;
      align-items: center;
      padding: 7px 9px;
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.68);
      color: var(--color-text-body);
      font-size: var(--text-small);
    }
    .reference-file-list span,
    .paper-preparation-progress li span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .reference-file-list button {
      border: 0;
      color: #9a4f2c;
      background: transparent;
      cursor: pointer;
      font-weight: 750;
    }
    .reference-file-error {
      grid-column: 1 / -1;
      margin: 0;
      color: #a74432;
      font-size: var(--text-small);
    }
    .paper-preparation-progress {
      position: relative;
      z-index: 2;
      display: grid;
      gap: 9px;
      margin-bottom: 14px;
      padding: 14px 16px;
      border: 1px solid rgba(44, 184, 198, 0.28);
      border-radius: var(--panel-radius);
      background: rgba(255, 255, 255, 0.88);
      box-shadow: var(--panel-shadow);
    }
    .paper-preparation-progress header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--color-primary-strong);
    }
    .paper-preparation-progress progress {
      width: 100%;
      height: 9px;
      accent-color: var(--color-accent);
    }
    .paper-preparation-progress > p {
      margin: 0;
      color: var(--color-text-body);
      font-size: var(--text-small);
    }
    .paper-preparation-progress li strong {
      color: var(--color-primary);
    }
    .paper-preparation-progress li small {
      grid-column: 1 / -1;
      color: #a74432;
    }
    .paper-markdown {
      display: grid;
      gap: 8px;
      max-height: 420px;
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
    .paper-markdown h2,
    .paper-markdown h3,
    .paper-markdown h4 {
      margin: 6px 0 2px;
      color: var(--color-text-main);
      line-height: 1.3;
    }
    .paper-markdown p {
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
    .reference-result-list,
    .history-list {
      display: grid;
      gap: 9px;
    }
    .reference-result-list article,
    .history-list a {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      color: inherit;
      text-decoration: none;
      border: 1px solid rgba(43, 83, 92, 0.12);
      border-radius: var(--control-radius);
      background: rgba(255, 255, 255, 0.62);
    }
    .reference-result-list p,
    .history-list span,
    .history-list small {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-small);
      line-height: 1.45;
    }
    .history-list strong {
      color: var(--color-text-main);
      font-size: 0.94rem;
      line-height: 1.34;
    }
    .paper-warning-list {
      display: grid;
      gap: 6px;
      margin: 0;
      padding-left: 18px;
      color: #9a5d12;
      font-size: var(--text-small);
      line-height: 1.45;
    }
    .paper-result-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 4px;
    }
    .paper-result-actions .panel-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
    }
    .paper-prism-background canvas {
      width: 100% !important;
      height: 100% !important;
    }
    @media (max-width: 1280px) {
      .workbench-layout {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    }
    @media (max-width: 820px) {
      .quality-panel,
      .file-picker-shell {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `
}

export function ExternalTeacherPapers() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = ''

    const style = document.createElement('style')
    style.textContent = buildStyles()
    const mount = document.createElement('div')
    mount.setAttribute('data-testid', 'external-teacher-test-generation-mount')
    shadowRoot.append(style, mount)

    let root: Root | null = createRoot(mount)
    root.render(<ExamGenerationPage />)

    return () => {
      root?.unmount()
      root = null
      shadowRoot.innerHTML = ''
    }
  }, [])

  return (
    <div
      ref={hostRef}
      className="external-teacher-test-generation-host"
      data-testid="external-teacher-test-generation-host"
    />
  )
}
