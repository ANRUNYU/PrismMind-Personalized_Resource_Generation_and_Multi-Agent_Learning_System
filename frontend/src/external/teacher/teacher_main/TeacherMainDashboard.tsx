import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

import blackHoleSource from './vanilla/black-hole-background.js?raw'
import teacherHtml from './vanilla/teacher-main.html?raw'
import teacherMainSource from './vanilla/teacher-main.js?raw'

const BLACK_HOLE_FACTORY = new Function(
  `${blackHoleSource.replace('export function createBlackHoleBackground', 'function createBlackHoleBackground')}
return createBlackHoleBackground;`
)() as (container: Element | null) => () => void

function buildTemplate(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed.querySelectorAll('script').forEach((item) => item.remove())
  const styles = Array.from(parsed.head.querySelectorAll('style'))
    .map((item) => item.textContent || '')
    .join('\n')

  return `
    <style>
      :host {
        display: block;
        position: relative;
        min-height: 100vh;
        min-height: 100dvh;
        overflow: hidden;
      }
      ${styles}
      .page-root {
        position: absolute !important;
        inset: 0 !important;
        min-height: 100vh;
        min-height: 100dvh;
      }
      .top-nav,
      .tree-interactive-nodes,
      .feature-sidebar,
      .function-panel,
      .user-popover,
      .sidebar-toggle {
        position: absolute !important;
      }
      .feature-sidebar::after {
        position: absolute !important;
      }
      .top-nav {
        padding-left: max(32px, env(safe-area-inset-left));
      }
    </style>
    ${parsed.body.innerHTML}
  `
}

function stripImports(source: string) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('import '))
    .join('\n')
}

function executeOriginalMain(shadowRoot: ShadowRoot) {
  const source = stripImports(teacherMainSource)
  const disposeEventName = '__prismmind_teacher_tree_dispose'
  const executableSource = source.replace(
    'window.addEventListener("pagehide", disposeScene, { once: true });',
    `window.addEventListener("pagehide", disposeScene, { once: true });
window.addEventListener("${disposeEventName}", disposeScene, { once: true });`
  )

  const scopedDocument = {
    querySelector(selector: string) {
      return shadowRoot.querySelector(selector) || document.querySelector(selector)
    },
    createElement(tagName: string) {
      return document.createElement(tagName)
    },
    body: {
      appendChild(element: Element) {
        shadowRoot.appendChild(element)
        return element
      }
    }
  }

  const run = new Function(
    'THREE',
    'GLTFLoader',
    'MeshSurfaceSampler',
    'OrbitControls',
    'createBlackHoleBackground',
    'document',
    'window',
    `${executableSource}
//# sourceURL=prismmind-teacher-external-tree.js`
  )

  run(THREE, GLTFLoader, MeshSurfaceSampler, OrbitControls, BLACK_HOLE_FACTORY, scopedDocument, window)

  return () => {
    window.dispatchEvent(new Event(disposeEventName))
  }
}

export function ExternalTeacherMain() {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined

    const shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = buildTemplate(teacherHtml)
    const pageRoot = shadowRoot.querySelector('.page-root')
    pageRoot?.setAttribute('data-testid', 'external-teacher-main')
    pageRoot?.setAttribute('data-external-source', 'Teacher/teacher_main')

    const dispose = executeOriginalMain(shadowRoot)

    return () => {
      dispose()
      shadowRoot.innerHTML = ''
    }
  }, [])

  return <div ref={hostRef} className="external-vanilla-tree-host" data-testid="external-teacher-vanilla-host" />
}
