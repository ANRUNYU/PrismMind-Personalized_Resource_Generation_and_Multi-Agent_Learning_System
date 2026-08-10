import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { renderMarkdown } from '@/utils/markdown'

import apiSource from './vanilla/curriculumDesignApi.js?raw'
import generationWorkbenchCss from './vanilla/GenerationWorkbench.css?raw'
import curriculumHtml from './vanilla/curriculum-design.html?raw'
import curriculumMainSource from './vanilla/curriculum-design.js?raw'
import prismBackgroundSource from './vanilla/prismBackground.js?raw'
import sharedTopNavCss from './vanilla/SharedTopNav.css?raw'
import sharedTopNavSource from './vanilla/SharedTopNavVanilla.js?raw'
import baseStylesCss from './vanilla/styles.css?raw'
import taskStreamPanelCss from '../../shared/task-stream-panel.css?raw'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'

const curriculumThemeVars = `
  --font-family-base: Inter, "HarmonyOS Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  --header-height: 72px;
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

declare global {
  interface Window {
    __PRISMMIND_API_BASE_URL__?: string
  }
}

function stripImportBlocks(source: string) {
  return source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];\s*/g, '')
}

function stripExports(source: string) {
  return source.replace(/\bexport\s+(?=(async\s+)?function|const|let|var|class)/g, '')
}

function buildApiAdapter() {
  const executableSource = stripExports(apiSource)
  const run = new Function(
    'window',
    `${executableSource}
return {
  fetchMyCurriculumDesigns,
  fetchKnowledgeDocuments,
  fetchMyCourses,
  generateCurriculumDesign,
  generateCurriculumDesignAsync,
  watchCurriculumDesignTask,
  fetchCurriculumDesignArtifact,
  saveCurriculumDesign,
  validateCurriculumDesignForm
};`
  )
  return run(window) as {
    fetchMyCurriculumDesigns: () => Promise<unknown>
    fetchKnowledgeDocuments: () => Promise<unknown>
    fetchMyCourses: () => Promise<unknown>
    generateCurriculumDesign: (values: unknown) => Promise<unknown>
    generateCurriculumDesignAsync: (values: unknown) => Promise<unknown>
    watchCurriculumDesignTask: (taskId: number, onEvent: (event: unknown) => void) => Promise<unknown>
    fetchCurriculumDesignArtifact: (artifactId: number, values: unknown) => Promise<unknown>
    saveCurriculumDesign: (design: unknown) => Promise<unknown>
    validateCurriculumDesignForm: (values: unknown) => unknown
  }
}

function buildPrismBackgroundFactory() {
  const executableSource = stripImportBlocks(prismBackgroundSource).replace(
    'export function mountCurriculumPrismBackground',
    'function mountCurriculumPrismBackground'
  )
  const run = new Function(
    'THREE',
    `${executableSource}
return mountCurriculumPrismBackground;`
  )
  return run(THREE) as (mount: Element | null) => () => void
}

function buildTemplate(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed.querySelectorAll('script, link').forEach((item) => item.remove())
  const bodyHtml = parsed.body.innerHTML

  return `
    <style>
      :host {
        ${curriculumThemeVars}
        display: block;
        position: relative;
        width: 100%;
        min-width: 0;
        height: auto;
        min-height: 100vh;
        min-height: 100dvh;
        overflow-x: hidden;
        overflow-y: auto;
        background: #f5f2ea;
      }
      .teacher-workbench-page {
        ${curriculumThemeVars}
      }
      ${baseStylesCss}
      ${sharedTopNavCss}
      ${generationWorkbenchCss}
      ${taskStreamPanelCss}
      .teacher-workbench-page {
        width: 100% !important;
        min-width: 0 !important;
        height: auto !important;
        min-height: 100vh !important;
        min-height: 100dvh !important;
        overflow-x: hidden !important;
        overflow-y: visible !important;
      }
      .field-grid {
        max-height: none !important;
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
      .workbench-panel--result,
      .curriculum-preview-result {
        min-height: 0 !important;
      }
      .curriculum-markdown {
        display: grid;
        gap: 8px;
        color: var(--color-text-body);
        font-size: 0.9rem;
        line-height: 1.56;
      }
      .curriculum-markdown h2,
      .curriculum-markdown h3,
      .curriculum-markdown h4 {
        margin: 6px 0 2px;
        color: var(--color-text-main);
        line-height: 1.3;
      }
      .curriculum-markdown p {
        margin: 0;
      }
      .curriculum-stream {
        display: grid;
        gap: 9px;
        padding: 12px;
        border: 1px solid rgba(43, 83, 92, 0.14);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.72);
      }
      .curriculum-task-stream { position: relative; z-index: 2; width: 100%; }
      .curriculum-task-stream[hidden] { display: none; }
      .curriculum-task-stream .curriculum-stream { background: rgba(255, 255, 255, 0.86); box-shadow: var(--panel-shadow); }
      .curriculum-stream header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .curriculum-stream progress, .quality-metrics progress { width: 100%; height: 7px; accent-color: var(--color-accent); }
      .curriculum-stream > p { margin: 0; color: var(--color-text-muted); font-size: var(--text-small); }
      .curriculum-stream-content { max-height: 440px; overflow: auto; padding-right: 5px; }
      .quality-panel--v2 { display: grid; gap: 8px; padding: 10px; }
      .quality-panel--v2 h4 { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0; }
      .quality-panel--v2 h4 small { color: var(--color-text-muted); font-weight: 400; }
      .quality-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
      .quality-metrics article { display: grid; gap: 5px; min-width: 0; padding: 8px; border: 1px solid rgba(43, 83, 92, 0.12); border-radius: 7px; }
      .quality-metrics article strong { display: flex; justify-content: space-between; gap: 6px; font-size: 0.76rem; }
      .quality-metrics article small { color: var(--color-text-muted); font-size: 0.68rem; line-height: 1.35; }
      .quality-keypoint-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
      .quality-keypoint-group { display: grid; align-content: start; gap: 5px; min-width: 0; padding: 7px; border: 1px solid rgba(43, 83, 92, 0.12); border-radius: 7px; }
      .quality-keypoint-group > strong { display: flex; justify-content: space-between; font-size: 0.76rem; }
      .quality-keypoint-group > strong small { color: var(--color-text-muted); font-weight: 400; }
      .quality-tag-list { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 4px; max-height: 68px; overflow: auto; }
      .quality-tag { max-width: 132px; overflow: hidden; padding: 2px 6px; border-radius: 5px; font-size: 0.66rem; text-overflow: ellipsis; white-space: nowrap; background: rgba(44, 184, 198, 0.11); color: var(--color-primary); }
      .quality-tag--missing { background: rgba(230, 162, 60, 0.13); color: #8a5a12; }
      .reference-result-list article,
      .curriculum-history-item {
        display: block;
        color: inherit;
        text-decoration: none;
      }
      .curriculum-result-actions {
        padding-top: 8px;
      }
      .curriculum-prism-background canvas {
        width: 100% !important;
        height: 100% !important;
      }
      .teacher-knowledge-source select {
        width: 100%;
        min-height: 96px;
        padding: 7px;
        border: 1px solid rgba(43, 83, 92, 0.18);
        border-radius: var(--control-radius);
        color: var(--color-text-body);
        background: rgba(255, 255, 255, 0.9);
      }
      .teacher-knowledge-source option { padding: 7px; }
      @media (max-width: 1280px), (max-height: 780px) {
        .workbench-layout {
          grid-template-columns: minmax(0, 1fr) !important;
          overflow: visible !important;
        }
      }
      @media (max-width: 720px) {
        .quality-metrics, .quality-keypoint-grid { grid-template-columns: 1fr; }
      }
    </style>
    ${bodyHtml}
  `
}

function executeSharedTopNav(scopedDocument: ReturnType<typeof createScopedDocument>) {
  const run = new Function('document', 'window', `${sharedTopNavSource}
//# sourceURL=prismmind-teacher-curriculum-shared-nav.js`)
  run(scopedDocument, window)
}

function executeCurriculumPage(shadowRoot: ShadowRoot, scopedDocument: ReturnType<typeof createScopedDocument>) {
  const api = buildApiAdapter()
  const mountCurriculumPrismBackground = buildPrismBackgroundFactory()
  const executableSource = stripImportBlocks(curriculumMainSource)
  const run = new Function(
    'fetchMyCurriculumDesigns',
    'fetchKnowledgeDocuments',
    'fetchMyCourses',
    'generateCurriculumDesign',
    'generateCurriculumDesignAsync',
    'watchCurriculumDesignTask',
    'fetchCurriculumDesignArtifact',
    'saveCurriculumDesign',
    'validateCurriculumDesignForm',
    'mountCurriculumPrismBackground',
    'renderSafeMarkdown',
    'document',
    'window',
    `${executableSource}
//# sourceURL=prismmind-teacher-curriculum-design.js`
  )

  run(
    api.fetchMyCurriculumDesigns,
    api.fetchKnowledgeDocuments,
    api.fetchMyCourses,
    api.generateCurriculumDesign,
    api.generateCurriculumDesignAsync,
    api.watchCurriculumDesignTask,
    api.fetchCurriculumDesignArtifact,
    api.saveCurriculumDesign,
    api.validateCurriculumDesignForm,
    mountCurriculumPrismBackground,
    renderMarkdown,
    scopedDocument,
    window
  )

  return () => {
    window.dispatchEvent(new Event('__prismmind_curriculum_design_dispose'))
  }
}

function createScopedDocument(shadowRoot: ShadowRoot) {
  return {
    querySelector(selector: string) {
      return shadowRoot.querySelector(selector) || document.querySelector(selector)
    },
    querySelectorAll(selector: string) {
      return shadowRoot.querySelectorAll(selector)
    },
    createElement(tagName: string) {
      return document.createElement(tagName)
    },
    addEventListener(...args: Parameters<Document['addEventListener']>) {
      document.addEventListener(...args)
    },
    removeEventListener(...args: Parameters<Document['removeEventListener']>) {
      document.removeEventListener(...args)
    },
    body: {
      appendChild(element: Element) {
        shadowRoot.appendChild(element)
        return element
      }
    }
  }
}

export function ExternalTeacherCurriculumDesign() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const previousApiBaseUrl = window.__PRISMMIND_API_BASE_URL__
    window.__PRISMMIND_API_BASE_URL__ = API_BASE_URL

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = buildTemplate(curriculumHtml)
    const pageRoot = shadowRoot.querySelector('.teacher-workbench-page')
    pageRoot?.setAttribute('data-testid', 'external-teacher-curriculum-design')
    pageRoot?.setAttribute('data-external-source', 'Teacher/curriculum_design')
    shadowRoot.querySelector('#sharedTopNavMount')?.setAttribute('data-home-href', '/teacher/dashboard')

    const scopedDocument = createScopedDocument(shadowRoot)
    executeSharedTopNav(scopedDocument)
    const dispose = executeCurriculumPage(shadowRoot, scopedDocument)

    return () => {
      dispose()
      if (previousApiBaseUrl === undefined) {
        delete window.__PRISMMIND_API_BASE_URL__
      } else {
        window.__PRISMMIND_API_BASE_URL__ = previousApiBaseUrl
      }
      shadowRoot.innerHTML = ''
    }
  }, [])

  return <div ref={hostRef} className="external-curriculum-design-host" data-testid="external-teacher-curriculum-design-host" />
}
