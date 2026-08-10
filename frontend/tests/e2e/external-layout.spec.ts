import { expect, test, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

import { accounts, ensureAdmin, expectExternalFullPage, gotoAuthLoading, gotoApp, loginViaUI } from './helpers'

const viewports = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1280', width: 1280, height: 720 }
]

const authRoutes = [
  { route: '/auth/login', root: 'external-login-page', selectors: ['.hero-content', '.auth-panel-shell'] },
  { route: '/auth/register', root: 'external-register-page', selectors: ['.register-copy', '.auth-panel-shell'] }
]

const studentRoutes = [
  { route: '/student/dashboard', root: 'external-student-main', selectors: ['.feature-sidebar', '.top-nav'] },
  { route: '/student/courses', root: 'external-student-courses', selectors: ['.mine-lessons-page .search-box', '.mine-lessons-page .join-code-box', '.mine-lessons-page .stats-panel', '.mine-lessons-page .lesson-detail-panel'] },
  { route: '/student/profile', root: 'external-student-portrait', selectors: ['.radar-visual-wrap', '.chat-panel', '.radar-data-panel', '.top-nav'] },
  { route: '/student/tests', root: 'external-student-tests', selectors: ['.tests-page .page-hero', '.tests-page .test-workbench', '.tests-page .side-column'] },
  { route: '/student/exercises', root: 'external-student-exercises', selectors: ['.mine-exercises-page .exercises-hero', '.mine-exercises-page .exercise-board'] },
  { route: '/student/resources', root: 'external-student-resources', selectors: ['.resource-center-page .top-nav', '.resource-center-page .resource-hero-copy', '.resource-center-page .resource-generator-panel', '.resource-center-page .resource-list-panel'] },
  { route: '/student/tutoring', root: 'external-student-tutoring', selectors: ['.tutoring-page .tutor-heading', '.tutoring-page .tutor-quick-tags', '.tutoring-page .tutor-chat-panel', '.tutoring-page .tutor-side'] },
  { route: '/student/assessments', root: 'external-student-assessments', selectors: ['.effect-appraisal-page .effect-hero', '.effect-appraisal-page .effect-layout'] },
  { route: '/student/learning-paths', root: 'external-student-study-plan', selectors: ['.study-plan-page .study-left-column', '.study-plan-page .study-center-column', '.study-plan-page .study-right-column'] }
]

const teacherRoutes = [
  { route: '/teacher/dashboard', root: 'external-teacher-main', selectors: ['.top-nav', '.feature-sidebar'] },
  { route: '/teacher/courses', root: 'external-teacher-courses', selectors: ['.teacher-courses-page .search-box', '.teacher-courses-page .join-code-box', '.teacher-courses-page .stats-panel', '.teacher-courses-page .lesson-detail-panel'] },
  { route: '/teacher/training-plans', root: 'external-teacher-training-program', selectors: ['.workbench-hero', '.workbench-panel--form', '[data-testid="external-teacher-training-skills"]', '[data-testid="external-teacher-training-plan-result"]'] },
  { route: '/teacher/course-designs', root: 'external-teacher-curriculum-design', selectors: ['.workbench-hero', '.workbench-panel--form', '.workbench-panel--preview'] },
  { route: '/teacher/exercises', root: 'external-teacher-exercise-generation', selectors: ['.workbench-hero', '.workbench-panel--form', '.workbench-panel--preview'] },
  { route: '/teacher/papers', root: 'external-teacher-test-generation', selectors: ['.workbench-hero', '.workbench-panel--form', '.workbench-panel--preview'] }
]

const teacherMainHotspotIds = [
  'training-plan',
  'course-design',
  'exercise-generate',
  'paper-generate',
  'my-courses',
  'my-exercises',
  'my-papers'
]

const adminRoutes = [
  { route: '/admin/dashboard', root: 'external-admin-dashboard', selectors: ['.external-admin-dashboard .my-exams-hero', '.external-admin-dashboard .exam-stack-shell'] },
  { route: '/admin/users', root: 'external-admin-users', selectors: ['.external-admin-users .my-exams-hero', '.external-admin-users .exam-stack-shell'] }
]

test.describe('external page responsive layout', () => {
  for (const viewport of viewports) {
    test(`auth external pages at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      test.setTimeout(240_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })

      for (const item of authRoutes) {
        await assertExternalRoute(page, item.route, item.root, item.selectors)
        await saveLayoutScreenshot(page, `${slug(item.route)}-${viewport.name}`)
      }

      const finishLoadingRoute = await assertLoadingRoute(page)
      try {
        await saveLayoutScreenshot(page, `auth-loading-${viewport.name}`)
      } finally {
        await finishLoadingRoute()
      }
    })

    test(`student external pages at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      test.setTimeout(600_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await loginViaUI(page, accounts.student)

      for (const item of studentRoutes) {
        await assertExternalRoute(page, item.route, item.root, item.selectors)
        await saveLayoutScreenshot(page, `${slug(item.route)}-${viewport.name}`)
        if (item.route === '/student/dashboard' && ['1366', '1600', '1920'].includes(viewport.name)) {
          await saveLayoutScreenshot(page, `student-main-overflow-${viewport.name}`)
        }
      }
    })

    test(`teacher external pages at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      test.setTimeout(300_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await loginViaUI(page, accounts.teacher)

      for (const item of teacherRoutes) {
        await assertExternalRoute(page, item.route, item.root, item.selectors)
        await saveLayoutScreenshot(page, `${slug(item.route)}-${viewport.name}`)
      }
    })

    test(`admin external pages at ${viewport.width}x${viewport.height}`, async ({ page, request }) => {
      test.setTimeout(300_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await ensureAdmin(request)
      await loginViaUI(page, accounts.admin)

      for (const item of adminRoutes) {
        await assertExternalRoute(page, item.route, item.root, item.selectors)
        await saveLayoutScreenshot(page, `${slug(item.route)}-${viewport.name}`)
      }
    })
  }
})

async function assertExternalRoute(page: Page, route: string, rootTestId: string, selectors: string[]) {
  await gotoApp(page, route)
  await expectExternalFullPage(page)

  const root = page.getByTestId(rootTestId)
  await expect(root).toBeVisible({ timeout: 20_000 })
  if (route === '/auth/login' || route === '/auth/register') {
    await expect(page.locator('.lens-background canvas')).toBeVisible()
  }

  const metrics = await root.evaluate((element) => {
    const style = window.getComputedStyle(element as HTMLElement)
    return {
      transform: style.transform,
      zoom: style.getPropertyValue('zoom') || '1',
      rootWidth: (element as HTMLElement).scrollWidth,
      rootClientWidth: (element as HTMLElement).clientWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      viewportHeight: window.innerHeight
    }
  })

  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(metrics.transform)
  const zoom = !metrics.zoom || metrics.zoom === 'normal' ? 1 : Number.parseFloat(metrics.zoom)
  expect(zoom).toBeCloseTo(1)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 4)
  expect(metrics.rootWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 8)

  if (metrics.documentHeight > metrics.viewportHeight + 24) {
    const canScroll = await page.evaluate(async () => {
      const before = window.scrollY
      window.scrollTo(0, Math.min(160, document.documentElement.scrollHeight - window.innerHeight))
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      const after = window.scrollY
      window.scrollTo(0, before)
      return after > before
    })
    expect(canScroll).toBeTruthy()
  }

  if (route === '/student/dashboard') {
    await assertStudentMainViewportCoverage(page)
  }
  if (route === '/student/courses') {
    await assertStudentCoursesCardStage(page)
  }
  if (route === '/student/tests') {
    await assertStudentTestsListLayout(page)
  }
  if (route === '/student/profile') {
    await assertStudentPortraitViewportCoverage(page)
  }
  if (route === '/student/tutoring') {
    await assertStudentTutoringViewportCoverage(page)
  }
  if (route === '/teacher/dashboard') {
    await assertTeacherMainViewportCoverage(page)
  }
  if (route === '/teacher/courses') {
    await assertTeacherCoursesViewportCoverage(page)
  }
  if (route === '/teacher/training-plans') {
    await assertTeacherTrainingProgramViewportCoverage(page)
  }
  if (route === '/teacher/course-designs') {
    await assertTeacherCurriculumDesignViewportCoverage(page)
  }
  if (route === '/teacher/exercises') {
    await assertTeacherExerciseGenerationViewportCoverage(page)
  }
  if (route === '/teacher/papers') {
    await assertTeacherTestGenerationViewportCoverage(page)
  }

  await expectNoVisibleOverlap(page, selectors)
}

async function assertTeacherTestGenerationViewportCoverage(page: Page) {
  const coverage = await page.evaluate(() => {
    const readRect = (element: Element | null) => {
      const rect = element?.getBoundingClientRect()
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null
    }

    const externalLayout = document.querySelector('[data-testid="external-full-page-layout"]') as HTMLElement | null
    const host = document.querySelector('[data-testid="external-teacher-test-generation-host"]') as HTMLElement | null
    const shadowRoot = host?.shadowRoot || null
    const pageRoot = shadowRoot?.querySelector('[data-testid="external-teacher-test-generation"]') as HTMLElement | null
    const topNav = shadowRoot?.querySelector('.top-nav') as HTMLElement | null
    const formPanel = shadowRoot?.querySelector('.workbench-panel--form') as HTMLElement | null
    const previewPanel = shadowRoot?.querySelector('.workbench-panel--preview') as HTMLElement | null
    const activeButton = shadowRoot?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    const layoutStyle = externalLayout ? getComputedStyle(externalLayout) : null
    const rootStyle = pageRoot ? getComputedStyle(pageRoot) : null

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      layoutClassName: externalLayout?.className || '',
      layoutBackground: layoutStyle?.backgroundColor || '',
      layoutOverflowX: layoutStyle?.overflowX || '',
      layoutScrollbarGutter: layoutStyle?.scrollbarGutter || '',
      rootTransform: rootStyle?.transform || '',
      rootZoom: rootStyle?.getPropertyValue('zoom') || '1',
      topNavCount: shadowRoot?.querySelectorAll('.top-nav').length || 0,
      brandStrongText: topNav?.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: topNav?.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      buttonsText: [...(topNav?.querySelectorAll('.top-nav-button') || [])].map((button) => button.textContent?.trim() || ''),
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || '',
      rects: {
        externalLayout: readRect(externalLayout),
        host: readRect(host),
        pageRoot: readRect(pageRoot),
        topNav: readRect(topNav),
        formPanel: readRect(formPanel),
        previewPanel: readRect(previewPanel)
      }
    }
  })

  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyBackground).toBe('rgb(245, 242, 234)')
  expect(coverage.layoutClassName).toContain('external-full-page-layout--teacher-test-generation')
  expect(coverage.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(['clip', 'hidden']).toContain(coverage.layoutOverflowX)
  expect(coverage.layoutScrollbarGutter).toBe('auto')
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(coverage.rootTransform)
  const zoom = !coverage.rootZoom || coverage.rootZoom === 'normal' ? 1 : Number.parseFloat(coverage.rootZoom)
  expect(zoom).toBeCloseTo(1)
  expect(coverage.topNavCount).toBe(1)
  expect(coverage.brandStrongText).toContain('核镜智教')
  expect(coverage.brandEmText).toContain('Prism Mind')
  expect(coverage.buttonsText).toEqual(['首页', '返回', '用户', '退出'])
  expect(coverage.activeUnderlineOpacity).toBe('0.72')
  expect(coverage.activeUnderlineHeight).toBe('1px')
  expect(coverage.activeDotOpacity).toBe('0.5')
  expect(coverage.activeDotWidth).toBe('5px')
  expect(coverage.activeDotHeight).toBe('5px')

  for (const rect of Object.values(coverage.rects)) {
    expect(rect).not.toBeNull()
    expect(rect!.left).toBeGreaterThanOrEqual(-1)
    expect(rect!.right).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect!.width).toBeGreaterThan(0)
  }
}

async function assertTeacherExerciseGenerationViewportCoverage(page: Page) {
  const coverage = await page.evaluate(() => {
    const readRect = (element: Element | null) => {
      const rect = element?.getBoundingClientRect()
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null
    }

    const externalLayout = document.querySelector('[data-testid="external-full-page-layout"]') as HTMLElement | null
    const host = document.querySelector('[data-testid="external-teacher-exercise-generation-host"]') as HTMLElement | null
    const shadowRoot = host?.shadowRoot || null
    const pageRoot = shadowRoot?.querySelector('[data-testid="external-teacher-exercise-generation"]') as HTMLElement | null
    const topNav = shadowRoot?.querySelector('.top-nav') as HTMLElement | null
    const formPanel = shadowRoot?.querySelector('.workbench-panel--form') as HTMLElement | null
    const previewPanel = shadowRoot?.querySelector('[data-testid="external-teacher-exercise-result-panel"]') as HTMLElement | null
    const activeButton = shadowRoot?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    const layoutStyle = externalLayout ? getComputedStyle(externalLayout) : null
    const rootStyle = pageRoot ? getComputedStyle(pageRoot) : null

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      layoutClassName: externalLayout?.className || '',
      layoutBackground: layoutStyle?.backgroundColor || '',
      layoutOverflowX: layoutStyle?.overflowX || '',
      layoutScrollbarGutter: layoutStyle?.scrollbarGutter || '',
      rootTransform: rootStyle?.transform || '',
      rootZoom: rootStyle?.getPropertyValue('zoom') || '1',
      topNavCount: shadowRoot?.querySelectorAll('.top-nav').length || 0,
      brandStrongText: topNav?.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: topNav?.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      buttonsText: [...(topNav?.querySelectorAll('.top-nav-button') || [])].map((button) => button.textContent?.trim() || ''),
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || '',
      rects: {
        externalLayout: readRect(externalLayout),
        host: readRect(host),
        pageRoot: readRect(pageRoot),
        topNav: readRect(topNav),
        formPanel: readRect(formPanel),
        previewPanel: readRect(previewPanel)
      }
    }
  })

  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyBackground).toBe('rgb(245, 242, 234)')
  expect(coverage.layoutClassName).toContain('external-full-page-layout--teacher-exercise-generation')
  expect(coverage.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(['clip', 'hidden']).toContain(coverage.layoutOverflowX)
  expect(coverage.layoutScrollbarGutter).toBe('auto')
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(coverage.rootTransform)
  const zoom = !coverage.rootZoom || coverage.rootZoom === 'normal' ? 1 : Number.parseFloat(coverage.rootZoom)
  expect(zoom).toBeCloseTo(1)
  expect(coverage.topNavCount).toBe(1)
  expect(coverage.brandStrongText).toContain('棱镜智教')
  expect(coverage.brandEmText).toContain('PrismMind')
  expect(coverage.buttonsText).toEqual(['首页', '返回', '用户', '退出'])
  expect(coverage.activeUnderlineOpacity).toBe('0.72')
  expect(coverage.activeUnderlineHeight).toBe('1px')
  expect(coverage.activeDotOpacity).toBe('0.5')
  expect(coverage.activeDotWidth).toBe('5px')
  expect(coverage.activeDotHeight).toBe('5px')

  for (const rect of Object.values(coverage.rects)) {
    expect(rect).not.toBeNull()
    expect(rect!.left).toBeGreaterThanOrEqual(-1)
    expect(rect!.right).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect!.width).toBeGreaterThan(0)
  }
}

async function assertStudentTestsListLayout(page: Page) {
  await page.locator('.tests-list-item, .test-empty-state').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined)
  const metrics = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        columns: style.gridTemplateColumns,
        overflowX: style.overflowX,
        overflowY: style.overflowY
      }
    }
    return {
      layout: read('.student-tests-layout'),
      hero: read('.tests-hero-card'),
      filters: read('.tests-filter-tabs'),
      list: read('.tests-list'),
      firstItem: read('.tests-list-item'),
      stats: read('.tests-stats-card'),
      detail: read('.test-detail-panel'),
      itemCount: document.querySelectorAll('.tests-list-item').length,
      oldRailCount: document.querySelectorAll('.test-filter-rail').length,
      oldStageCount: document.querySelectorAll('.test-card-system, .test-scene-layer').length,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth
    }
  })

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.layout).not.toBeNull()
  expect(metrics.hero).not.toBeNull()
  expect(metrics.filters).not.toBeNull()
  expect(metrics.list).not.toBeNull()
  expect(metrics.stats).not.toBeNull()
  expect(metrics.detail).not.toBeNull()
  expect(metrics.oldRailCount).toBe(0)
  expect(metrics.oldStageCount).toBe(0)
  expect(metrics.filters?.columns.split(' ').length).toBe(5)
  expect(metrics.list?.overflowY).toBe('auto')
  expect(metrics.detail?.overflowY).toBe('auto')
  expect(metrics.itemCount).toBeGreaterThan(0)
  expect(metrics.firstItem?.height).toBeGreaterThanOrEqual(140)
  expect(metrics.stats?.top).toBeCloseTo(metrics.hero?.top || 0, 0)
}

async function assertStudentCoursesCardStage(page: Page) {
  const metrics = await page.evaluate(() => {
    const parseTranslateZ = (transform: string) => {
      const matrix3d = transform.match(/matrix3d\(([^)]+)\)/)
      if (matrix3d) {
        const values = matrix3d[1].split(',').map((item) => Number.parseFloat(item.trim()))
        return values[14] || 0
      }
      const translate3d = transform.match(/translate3d\([^,]+,[^,]+,\s*([-\d.]+)px\)/)
      return translate3d ? Number.parseFloat(translate3d[1]) : 0
    }

    const scene = document.querySelector('.lesson-scene-layer')
    const stage = document.querySelector('.lesson-card-system')
    const sceneStyle = scene ? window.getComputedStyle(scene) : null
    const stageStyle = stage ? window.getComputedStyle(stage) : null
    const cards = [...document.querySelectorAll('[data-card="student-course"], .lesson-prism-card')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => {
        const style = window.getComputedStyle(element)
        return {
          zIndex: Number.parseInt(style.zIndex || '0', 10) || 0,
          translateZ: parseTranslateZ(style.transform),
          opacity: Number.parseFloat(style.opacity || '1')
        }
      })
    const byZ = [...cards].sort((a, b) => b.zIndex - a.zIndex)
    const byDepth = [...cards].sort((a, b) => b.translateZ - a.translateZ)
    const cardParts = [...document.querySelectorAll('.prism-card-face, .prism-card-side')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => window.getComputedStyle(element).backfaceVisibility)

    return {
      count: cards.length,
      sceneOverflowX: sceneStyle?.overflowX || '',
      sceneOverflowY: sceneStyle?.overflowY || '',
      scenePerspective: sceneStyle?.perspective || '',
      stageTransformStyle: stageStyle?.transformStyle || '',
      frontZIndex: byZ[0]?.zIndex || 0,
      secondZIndex: byZ[1]?.zIndex || 0,
      frontTranslateZ: byZ[0]?.translateZ || 0,
      secondTranslateZ: byZ[1]?.translateZ || 0,
      maxDepthZIndex: byDepth[0]?.zIndex || 0,
      frontOpacity: byZ[0]?.opacity || 0,
      secondOpacity: byZ[1]?.opacity || 0,
      cardPartsBackfaceHidden: cardParts.every((value) => value === 'hidden'),
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth
    }
  })

  if (metrics.count === 0) return

  expect(metrics.sceneOverflowX).toBe('hidden')
  expect(metrics.sceneOverflowY).toBe('hidden')
  expect(metrics.scenePerspective).toBe('1200px')
  expect(metrics.stageTransformStyle).toBe('preserve-3d')
  expect(metrics.frontZIndex).toBeGreaterThan(metrics.secondZIndex)
  expect(metrics.frontTranslateZ).toBeGreaterThanOrEqual(metrics.secondTranslateZ)
  expect(metrics.maxDepthZIndex).toBe(metrics.frontZIndex)
  expect(metrics.frontOpacity).toBeGreaterThanOrEqual(metrics.secondOpacity)
  expect(metrics.cardPartsBackfaceHidden).toBeTruthy()
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
}

async function assertTeacherCoursesViewportCoverage(page: Page) {
  const coverage = await page.evaluate(() => {
    const readRect = (element: Element | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth,
        overflowX: style.overflowX,
        backgroundColor: style.backgroundColor,
        marginTop: style.marginTop,
        paddingTop: style.paddingTop,
        background: style.background,
        borderRadius: style.borderRadius,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        transform: style.transform,
        zoom: style.getPropertyValue('zoom') || '1'
      }
    }

    const parseTranslateZ = (transform: string) => {
      const matrix3d = transform.match(/matrix3d\(([^)]+)\)/)
      if (matrix3d) {
        const values = matrix3d[1].split(',').map((item) => Number.parseFloat(item.trim()))
        return values[14] || 0
      }
      const translate3d = transform.match(/translate3d\([^,]+,[^,]+,\s*([-\d.]+)px\)/)
      return translate3d ? Number.parseFloat(translate3d[1]) : 0
    }

    const externalLayout = document.querySelector('.external-full-page-layout') as HTMLElement | null
    const host = document.querySelector('.external-react-page-host--teacher-courses') as HTMLElement | null
    const pageRoot = document.querySelector('[data-testid="external-teacher-courses"]') as HTMLElement | null
    const topNav = pageRoot?.querySelector('.top-nav') as HTMLElement | null
    const activeButton = topNav?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    const topNavStyle = topNav ? getComputedStyle(topNav) : null
    const topNavRect = topNav?.getBoundingClientRect()
    const topNavMark = topNav?.querySelector('.top-nav-mark') as HTMLElement | null
    const topNavMarkStyle = topNavMark ? getComputedStyle(topNavMark) : null
    const scene = pageRoot?.querySelector('.lesson-scene-layer') as HTMLElement | null
    const hero = pageRoot?.querySelector('.page-hero') as HTMLElement | null
    const toolbar = pageRoot?.querySelector('.toolbar-row') as HTMLElement | null
    const stage = pageRoot?.querySelector('.lesson-card-system') as HTMLElement | null
    const detailPanel = pageRoot?.querySelector('.lesson-detail-panel') as HTMLElement | null
    const statsPanel = pageRoot?.querySelector('.stats-panel') as HTMLElement | null
    const rootStyle = pageRoot ? getComputedStyle(pageRoot) : null
    const layoutStyle = externalLayout ? getComputedStyle(externalLayout) : null
    const sceneStyle = scene ? getComputedStyle(scene) : null
    const stageStyle = stage ? getComputedStyle(stage) : null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 2, Math.floor(window.innerHeight / 2)) as HTMLElement | null
    const rightEdgeStyle = rightEdgeElement ? getComputedStyle(rightEdgeElement) : null
    const cards = [...document.querySelectorAll('[data-card="teacher-course"], .lesson-prism-card')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => {
        const style = getComputedStyle(element)
        return {
          zIndex: Number.parseInt(style.zIndex || '0', 10) || 0,
          opacity: Number.parseFloat(style.opacity || '1'),
          translateZ: parseTranslateZ(style.transform)
        }
      })
    const byZ = [...cards].sort((a, b) => b.zIndex - a.zIndex)
    const byDepth = [...cards].sort((a, b) => b.translateZ - a.translateZ)
    const cardParts = [...document.querySelectorAll('.prism-card-face, .prism-card-side')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => getComputedStyle(element).backfaceVisibility)

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      layoutClassName: externalLayout?.className || '',
      layoutBackground: layoutStyle?.backgroundColor || '',
      layoutOverflowX: layoutStyle?.overflowX || '',
      layoutScrollbarGutter: layoutStyle?.scrollbarGutter || '',
      rootTransform: rootStyle?.transform || '',
      rootZoom: rootStyle?.getPropertyValue('zoom') || '1',
      rightEdgeTag: rightEdgeElement?.tagName || null,
      rightEdgeBackground: rightEdgeStyle?.backgroundColor || '',
      topNavCount: pageRoot?.querySelectorAll('.top-nav').length || 0,
      topNavTop: topNavRect ? Math.round(topNavRect.top) : -1,
      topNavHeight: topNavRect ? Math.round(topNavRect.height) : 0,
      topNavDisplay: topNavStyle?.display || '',
      topNavGridTemplateColumns: topNavStyle?.gridTemplateColumns || '',
      topNavColumnGap: topNavStyle?.columnGap || '',
      topNavPaddingLeft: topNavStyle?.paddingLeft || '',
      topNavPaddingRight: topNavStyle?.paddingRight || '',
      topNavMarkDisplay: topNavMarkStyle?.display || '',
      brandStrongText: topNav?.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: topNav?.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      navButtonsText: [...(topNav?.querySelectorAll('.top-nav-button') || [])].map((button) => button.textContent?.trim() || ''),
      navButtonPositions: [...(topNav?.querySelectorAll('.top-nav-button') || [])].map((button) => {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        return {
          text: button.textContent?.trim() || '',
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          height: Math.round(rect.height),
          whiteSpace: style.whiteSpace
        }
      }),
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || '',
      studentCardCount: document.querySelectorAll('[data-card="student-course"]').length,
      legacyMainLayoutCount: document.querySelectorAll('[data-testid="legacy-main-layout"], .main-layout__header, .main-layout__aside, .main-layout__content').length,
      cardCount: cards.length,
      sceneOverflowX: sceneStyle?.overflowX || '',
      sceneOverflowY: sceneStyle?.overflowY || '',
      scenePerspective: sceneStyle?.perspective || '',
      stageTransformStyle: stageStyle?.transformStyle || '',
      frontZIndex: byZ[0]?.zIndex || 0,
      secondZIndex: byZ[1]?.zIndex || 0,
      frontTranslateZ: byZ[0]?.translateZ || 0,
      secondTranslateZ: byZ[1]?.translateZ || 0,
      maxDepthZIndex: byDepth[0]?.zIndex || 0,
      frontOpacity: byZ[0]?.opacity || 0,
      secondOpacity: byZ[1]?.opacity || 0,
      cardPartsBackfaceHidden: cardParts.every((value) => value === 'hidden'),
      rects: {
        externalLayout: readRect(externalLayout),
        host: readRect(host),
        pageRoot: readRect(pageRoot),
        topNav: readRect(topNav),
        hero: readRect(hero),
        toolbar: readRect(toolbar),
        scene: readRect(scene),
        statsPanel: readRect(statsPanel),
        detailPanel: readRect(detailPanel)
      }
    }
  })

  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyBackground).toBe('rgb(245, 242, 234)')
  expect(coverage.layoutClassName).toContain('external-full-page-layout--teacher-courses')
  expect(coverage.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(coverage.layoutOverflowX).toBe('hidden')
  expect(coverage.layoutScrollbarGutter).toBe('auto')
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(coverage.rootTransform)
  const zoom = !coverage.rootZoom || coverage.rootZoom === 'normal' ? 1 : Number.parseFloat(coverage.rootZoom)
  expect(zoom).toBeCloseTo(1)
  expect(coverage.rightEdgeBackground).not.toBe('rgb(2, 6, 23)')
  expect(['BODY', 'HTML', null]).not.toContain(coverage.rightEdgeTag)
  expect(coverage.topNavCount).toBe(1)
  expect(coverage.topNavTop).toBe(0)
  expect(coverage.topNavHeight).toBeGreaterThanOrEqual(70)
  expect(coverage.topNavHeight).toBeLessThanOrEqual(74)
  expect(coverage.topNavDisplay).toBe('grid')
  expect(coverage.topNavGridTemplateColumns.split(' ').filter(Boolean)).toHaveLength(3)
  expect(coverage.topNavMarkDisplay).toBe('none')
  expect(coverage.brandStrongText).toBe('棱镜智教')
  expect(coverage.brandEmText).toBe('PrismMind')
  expect(coverage.navButtonsText).toEqual(['首页', '返回', '用户', '退出'])
  expect(coverage.navButtonPositions).toHaveLength(4)
  const navButtonTops = coverage.navButtonPositions.map((button) => button.top)
  expect(Math.max(...navButtonTops) - Math.min(...navButtonTops)).toBeLessThanOrEqual(6)
  expect(coverage.navButtonPositions.every((button) => button.whiteSpace === 'nowrap')).toBeTruthy()
  expect(coverage.rects.hero?.paddingTop).toBe('28px')
  expect(coverage.rects.hero?.height).toBeGreaterThanOrEqual(170)
  expect(coverage.rects.hero?.background).not.toBe('rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box')
  expect(coverage.rects.hero?.borderRadius).toBe('8px')
  expect(coverage.rects.hero?.borderTopWidth).toBe('1px')
  expect(coverage.rects.hero?.boxShadow).not.toBe('none')
  expect(coverage.rects.hero?.top).toBeLessThanOrEqual(140)
  expect(coverage.rects.toolbar?.top).toBeLessThanOrEqual(310)
  expect(coverage.rects.scene?.top).toBeLessThanOrEqual(420)
  expect(coverage.rects.statsPanel?.top).toBeLessThanOrEqual(140)
  expect(coverage.rects.detailPanel?.top).toBeLessThanOrEqual(260)
  expect((coverage.rects.scene?.top || 0) - (coverage.rects.hero?.bottom || 0)).toBeGreaterThanOrEqual(0)
  expect((coverage.rects.scene?.top || 0) - (coverage.rects.hero?.bottom || 0)).toBeLessThanOrEqual(24)
  expect(coverage.activeUnderlineOpacity).toBe('0.72')
  expect(coverage.activeUnderlineHeight).toBe('1px')
  expect(coverage.activeDotOpacity).toBe('0.5')
  expect(coverage.activeDotWidth).toBe('5px')
  expect(coverage.activeDotHeight).toBe('5px')
  expect(coverage.studentCardCount).toBe(0)
  expect(coverage.legacyMainLayoutCount).toBe(0)

  if (coverage.cardCount > 0) {
    expect(coverage.sceneOverflowX).toBe('hidden')
    expect(coverage.sceneOverflowY).toBe('hidden')
    expect(coverage.scenePerspective).toBe('1200px')
    expect(coverage.stageTransformStyle).toBe('preserve-3d')
    expect(coverage.frontZIndex).toBeGreaterThan(coverage.secondZIndex)
    expect(coverage.frontTranslateZ).toBeGreaterThanOrEqual(coverage.secondTranslateZ)
    expect(coverage.maxDepthZIndex).toBe(coverage.frontZIndex)
    expect(coverage.frontOpacity).toBeGreaterThanOrEqual(coverage.secondOpacity)
    expect(coverage.cardPartsBackfaceHidden).toBeTruthy()
  }

  for (const [name, rect] of Object.entries(coverage.rects)) {
    expect(rect, `${name} rect exists`).not.toBeNull()
    expect(rect?.left, `${name} starts inside viewport`).toBeGreaterThanOrEqual(-1)
    expect(rect?.right, `${name} does not exceed viewport right edge`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.width, `${name} width does not exceed viewport`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.scrollWidth, `${name} has no horizontal overflow`).toBeLessThanOrEqual((rect?.clientWidth || 0) + 1)
  }
}

async function assertTeacherTrainingProgramViewportCoverage(page: Page) {
  const coverage = await page.evaluate(() => {
    type LayoutRect = {
      left: number
      right: number
      width: number
      height: number
      overflowX: string
      backgroundColor: string
      clientWidth: number
      scrollWidth: number
    } | null

    const rectOf = (element: Element | null): LayoutRect => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        overflowX: style.overflowX,
        backgroundColor: style.backgroundColor,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth
      }
    }

    const externalLayout = document.querySelector('.external-full-page-layout') as HTMLElement | null
    const host = document.querySelector('[data-testid="external-teacher-training-program-host"]') as HTMLElement | null
    const shadowRoot = host?.shadowRoot || null
    const pageRoot = shadowRoot?.querySelector('[data-testid="external-teacher-training-program"]') as HTMLElement | null
    const topNav = shadowRoot?.querySelector('.top-nav') as HTMLElement | null
    const activeButton = shadowRoot?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 2, Math.floor(window.innerHeight / 2)) as HTMLElement | null
    const externalLayoutStyle = externalLayout ? getComputedStyle(externalLayout) : null
    const rightEdgeStyle = rightEdgeElement ? getComputedStyle(rightEdgeElement) : null

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      layoutClassName: externalLayout?.className || '',
      layoutBackground: externalLayoutStyle?.backgroundColor || '',
      layoutOverflowX: externalLayoutStyle?.overflowX || '',
      layoutScrollbarGutter: externalLayoutStyle?.scrollbarGutter || '',
      rightEdgeTag: rightEdgeElement?.tagName || null,
      rightEdgeBackground: rightEdgeStyle?.backgroundColor || '',
      topNavCount: shadowRoot?.querySelectorAll('.top-nav').length ?? 0,
      brandStrongText: topNav?.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: topNav?.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      navButtonsText: [...(topNav?.querySelectorAll('.top-nav-button') ?? [])].map((button) => button.textContent?.trim() || ''),
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || '',
      rects: {
        externalLayout: rectOf(externalLayout),
        host: rectOf(host),
        pageRoot: rectOf(pageRoot),
        topNav: rectOf(topNav)
      }
    }
  })

  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyBackground).toBe('rgb(245, 242, 234)')
  expect(coverage.layoutClassName).toContain('external-full-page-layout--teacher-training-program')
  expect(coverage.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(['clip', 'hidden']).toContain(coverage.layoutOverflowX)
  expect(coverage.layoutScrollbarGutter).toBe('auto')
  expect(coverage.rightEdgeBackground).not.toBe('rgb(2, 6, 23)')
  expect(['BODY', 'HTML', null]).not.toContain(coverage.rightEdgeTag)
  expect(coverage.topNavCount).toBe(1)
  expect(coverage.brandStrongText).toBe('核镜智教')
  expect(coverage.brandEmText).toBe('Prism Mind')
  expect(coverage.navButtonsText).toEqual(['首页', '返回', '用户', '退出'])
  expect(coverage.activeUnderlineOpacity).toBe('0.72')
  expect(coverage.activeUnderlineHeight).toBe('1px')
  expect(coverage.activeDotOpacity).toBe('0.5')
  expect(coverage.activeDotWidth).toBe('5px')
  expect(coverage.activeDotHeight).toBe('5px')

  for (const [name, rect] of Object.entries(coverage.rects)) {
    expect(rect, `${name} rect exists`).not.toBeNull()
    expect(rect?.left, `${name} starts inside viewport`).toBeGreaterThanOrEqual(-1)
    expect(rect?.right, `${name} covers viewport right edge`).toBeGreaterThanOrEqual(coverage.viewportWidth - 1)
    expect(rect?.width, `${name} width does not exceed viewport`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.scrollWidth, `${name} has no horizontal overflow`).toBeLessThanOrEqual((rect?.clientWidth || 0) + 1)
  }
}

async function assertTeacherCurriculumDesignViewportCoverage(page: Page) {
  const coverage = await page.evaluate(() => {
    type LayoutRect = {
      left: number
      right: number
      width: number
      height: number
      overflowX: string
      backgroundColor: string
      clientWidth: number
      scrollWidth: number
    } | null

    const rectOf = (element: Element | null): LayoutRect => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        overflowX: style.overflowX,
        backgroundColor: style.backgroundColor,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth
      }
    }

    const externalLayout = document.querySelector('.external-full-page-layout') as HTMLElement | null
    const host = document.querySelector('[data-testid="external-teacher-curriculum-design-host"]') as HTMLElement | null
    const shadowRoot = host?.shadowRoot || null
    const pageRoot = shadowRoot?.querySelector('[data-testid="external-teacher-curriculum-design"]') as HTMLElement | null
    const topNav = shadowRoot?.querySelector('.top-nav') as HTMLElement | null
    const formPanel = shadowRoot?.querySelector('.workbench-panel--form') as HTMLElement | null
    const previewPanel = shadowRoot?.querySelector('.workbench-panel--preview:last-child') as HTMLElement | null
    const background = shadowRoot?.querySelector('.curriculum-prism-background') as HTMLElement | null
    const activeButton = shadowRoot?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    const externalLayoutStyle = externalLayout ? getComputedStyle(externalLayout) : null
    const rootStyle = pageRoot ? getComputedStyle(pageRoot) : null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 2, Math.floor(window.innerHeight / 2)) as HTMLElement | null
    const rightEdgeStyle = rightEdgeElement ? getComputedStyle(rightEdgeElement) : null

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      rootTransform: rootStyle?.transform || '',
      rootZoom: rootStyle?.getPropertyValue('zoom') || '1',
      layoutClassName: externalLayout?.className || '',
      layoutBackground: externalLayoutStyle?.backgroundColor || '',
      layoutOverflowX: externalLayoutStyle?.overflowX || '',
      layoutScrollbarGutter: externalLayoutStyle?.scrollbarGutter || '',
      rightEdgeTag: rightEdgeElement?.tagName || null,
      rightEdgeBackground: rightEdgeStyle?.backgroundColor || '',
      topNavCount: shadowRoot?.querySelectorAll('.top-nav').length ?? 0,
      brandStrongText: topNav?.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: topNav?.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      navButtonsText: [...(topNav?.querySelectorAll('.top-nav-button') ?? [])].map((button) => button.textContent?.trim() || ''),
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || '',
      hasCurriculumBackground: Boolean(background),
      backgroundPointerEvents: background ? getComputedStyle(background).pointerEvents : '',
      rects: {
        externalLayout: rectOf(externalLayout),
        host: rectOf(host),
        pageRoot: rectOf(pageRoot),
        topNav: rectOf(topNav),
        formPanel: rectOf(formPanel),
        previewPanel: rectOf(previewPanel)
      }
    }
  })

  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyBackground).toBe('rgb(245, 242, 234)')
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(coverage.rootTransform)
  const zoom = !coverage.rootZoom || coverage.rootZoom === 'normal' ? 1 : Number.parseFloat(coverage.rootZoom)
  expect(zoom).toBeCloseTo(1)
  expect(coverage.layoutClassName).toContain('external-full-page-layout--teacher-curriculum-design')
  expect(coverage.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(['clip', 'hidden']).toContain(coverage.layoutOverflowX)
  expect(coverage.layoutScrollbarGutter).toBe('auto')
  expect(coverage.rightEdgeBackground).not.toBe('rgb(2, 6, 23)')
  expect(['BODY', 'HTML', null]).not.toContain(coverage.rightEdgeTag)
  expect(coverage.topNavCount).toBe(1)
  expect(coverage.brandStrongText).toBe('棱镜智教')
  expect(coverage.brandEmText).toBe('PrismMind')
  expect(coverage.navButtonsText).toEqual(['首页', '返回', '用户', '退出'])
  expect(coverage.activeUnderlineOpacity).toBe('0.72')
  expect(coverage.activeUnderlineHeight).toBe('1px')
  expect(coverage.activeDotOpacity).toBe('0.5')
  expect(coverage.activeDotWidth).toBe('5px')
  expect(coverage.activeDotHeight).toBe('5px')
  expect(coverage.hasCurriculumBackground).toBeTruthy()
  expect(coverage.backgroundPointerEvents).toBe('none')

  for (const [name, rect] of Object.entries(coverage.rects)) {
    expect(rect, `${name} rect exists`).not.toBeNull()
    expect(rect?.left, `${name} starts inside viewport`).toBeGreaterThanOrEqual(-1)
    expect(rect?.right, `${name} does not exceed viewport right edge`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.width, `${name} width does not exceed viewport`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.scrollWidth, `${name} has no horizontal overflow`).toBeLessThanOrEqual((rect?.clientWidth || 0) + 1)
  }
}

async function assertStudentTutoringViewportCoverage(page: Page) {
  const coverage = await page.evaluate(() => {
    type ScrollNode = {
      root: string
      tag: string
      id: string
      className: string
      clientWidth: number
      scrollWidth: number
      overflowX: string
    }

    const rectOf = (element: Element | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        transform: style.transform,
        zoom: style.getPropertyValue('zoom') || '1',
        overflowX: style.overflowX,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth
      }
    }

    const collectHorizontalScrollContainers = (root: Document | ShadowRoot, label: string, nodes: ScrollNode[] = []) => {
      root.querySelectorAll('*').forEach((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        if (!visible) return

        if (style.overflowX === 'scroll' || (style.overflowX === 'auto' && element.scrollWidth > element.clientWidth + 1)) {
          nodes.push({
            root: label,
            tag: element.tagName,
            id: element.id,
            className: String(element.className || ''),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            overflowX: style.overflowX
          })
        }
      })
      return nodes
    }

    const root = document.querySelector('[data-testid="external-student-tutoring"]')
    const layout = document.querySelector('.external-full-page-layout')
    const workbench = document.querySelector('.tutor-workbench')
    const main = document.querySelector('.tutor-main')
    const side = document.querySelector('.tutor-side')
    const chat = document.querySelector('.tutor-chat-panel')
    const input = document.querySelector('.tutor-input-row')
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      rightEdgeTag: rightEdgeElement?.tagName || null,
      rects: {
        layout: rectOf(layout),
        root: rectOf(root),
        workbench: rectOf(workbench),
        main: rectOf(main),
        side: rectOf(side),
        chat: rectOf(chat),
        input: rectOf(input)
      },
      horizontalScrollContainers: collectHorizontalScrollContainers(document, 'document')
    }
  })

  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.horizontalScrollContainers, JSON.stringify(coverage.horizontalScrollContainers, null, 2)).toEqual([])

  for (const [name, rect] of Object.entries(coverage.rects)) {
    expect(rect, `${name} rect exists`).not.toBeNull()
    expect(rect?.left, `${name} starts inside viewport`).toBeGreaterThanOrEqual(-1)
    expect(rect?.right, `${name} does not exceed viewport right edge`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.width, `${name} width does not exceed viewport`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.scrollWidth, `${name} has no horizontal overflow`).toBeLessThanOrEqual((rect?.clientWidth || 0) + 1)
  }
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(coverage.rects.root?.transform)
  const zoom = !coverage.rects.root?.zoom || coverage.rects.root.zoom === 'normal' ? 1 : Number.parseFloat(coverage.rects.root.zoom)
  expect(zoom).toBeCloseTo(1)
}

async function assertStudentPortraitViewportCoverage(page: Page) {
  const coverage = await page.evaluate(() => {
    type ScrollNode = {
      root: string
      tag: string
      id: string
      className: string
      clientWidth: number
      scrollWidth: number
      overflowX: string
    }

    const rectOf = (element: Element | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        transform: style.transform,
        zoom: style.getPropertyValue('zoom') || '1',
        overflowX: style.overflowX,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth
      }
    }

    const collectHorizontalScrollContainers = (root: Document | ShadowRoot, label: string, nodes: ScrollNode[] = []) => {
      root.querySelectorAll('*').forEach((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        if (!visible) return

        if (style.overflowX === 'scroll' || (style.overflowX === 'auto' && element.scrollWidth > element.clientWidth + 1)) {
          nodes.push({
            root: label,
            tag: element.tagName,
            id: element.id,
            className: String(element.className || ''),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            overflowX: style.overflowX
          })
        }

        const shadowRoot = (element as HTMLElement).shadowRoot
        if (shadowRoot) collectHorizontalScrollContainers(shadowRoot, `${label} > ${element.tagName}.${element.id || 'shadow'}`, nodes)
      })
      return nodes
    }

    const host = document.querySelector('[data-testid="external-student-portrait"]') as HTMLElement | null
    const shadowRoot = host?.shadowRoot || null
    const portraitRoot = shadowRoot?.querySelector('.external-student-portrait-original') || null
    const pageRoot = shadowRoot?.querySelector('.radar-profile-page') || null
    const radarShell = shadowRoot?.querySelector('.dynamic-radar-shell') || null
    const chatPanel = shadowRoot?.querySelector('.chat-panel') || null
    const dataPanel = shadowRoot?.querySelector('.radar-data-panel') || null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      bodyBackground: window.getComputedStyle(document.body).backgroundColor,
      rightEdgeTag: rightEdgeElement?.tagName || null,
      hasShadowRoot: Boolean(shadowRoot),
      rects: {
        host: rectOf(host),
        portraitRoot: rectOf(portraitRoot),
        pageRoot: rectOf(pageRoot),
        radarShell: rectOf(radarShell),
        chatPanel: rectOf(chatPanel),
        dataPanel: rectOf(dataPanel)
      },
      horizontalScrollContainers: collectHorizontalScrollContainers(document, 'document')
    }
  })

  expect(coverage.hasShadowRoot).toBeTruthy()
  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyBackground).toBe('rgb(243, 240, 232)')
  expect(['BODY', 'HTML', null]).not.toContain(coverage.rightEdgeTag)
  expect(coverage.horizontalScrollContainers, JSON.stringify(coverage.horizontalScrollContainers, null, 2)).toEqual([])

  for (const [name, rect] of Object.entries(coverage.rects)) {
    expect(rect, `${name} rect exists`).not.toBeNull()
    expect(rect?.left, `${name} starts inside viewport`).toBeGreaterThanOrEqual(-1)
    expect(rect?.right, `${name} does not exceed viewport right edge`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.width, `${name} width does not exceed viewport`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.scrollWidth, `${name} has no horizontal overflow`).toBeLessThanOrEqual((rect?.clientWidth || 0) + 1)
  }

  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(coverage.rects.host?.transform)
  const zoom = !coverage.rects.host?.zoom || coverage.rects.host.zoom === 'normal' ? 1 : Number.parseFloat(coverage.rects.host.zoom)
  expect(zoom).toBeCloseTo(1)
}

async function assertStudentMainViewportCoverage(page: Page) {
  const coverage = await page.evaluate(() => {
    type OverflowNode = {
      root: string
      tag: string
      id: string
      className: string
      left: number
      right: number
      width: number
    }

    const rectOf = (element: Element | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        position: style.position,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth
      }
    }

    const collectOverflowNodes = (root: Document | ShadowRoot, label: string, nodes: OverflowNode[] = []) => {
      root.querySelectorAll('*').forEach((element) => {
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return

        const rect = element.getBoundingClientRect()
        const className = typeof element.className === 'string' ? element.className : String(element.className || '')
        if (rect.right > window.innerWidth + 1 || rect.left < -1) {
          nodes.push({
            root: label,
            tag: element.tagName,
            id: element.id,
            className,
            left: rect.left,
            right: rect.right,
            width: rect.width
          })
        }

        const shadowRoot = (element as HTMLElement).shadowRoot
        if (shadowRoot) collectOverflowNodes(shadowRoot, `${label} > ${element.tagName}.${className || element.id || 'shadow'}`, nodes)
      })
      return nodes
    }

    const collectHorizontalScrollContainers = (root: Document | ShadowRoot, label: string, nodes: OverflowNode[] = []) => {
      root.querySelectorAll('*').forEach((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        if (!visible) return

        const hasNativeHorizontalScrollbar =
          style.overflowX === 'scroll' || (style.overflowX === 'auto' && element.scrollWidth > element.clientWidth + 1)
        if (hasNativeHorizontalScrollbar) {
          const className = typeof element.className === 'string' ? element.className : String(element.className || '')
          nodes.push({
            root: label,
            tag: element.tagName,
            id: element.id,
            className,
            left: rect.left,
            right: rect.right,
            width: rect.width
          })
        }

        const shadowRoot = (element as HTMLElement).shadowRoot
        if (shadowRoot) collectHorizontalScrollContainers(shadowRoot, `${label} > ${element.tagName}.${element.id || 'shadow'}`, nodes)
      })
      return nodes
    }

    const layout = document.querySelector('.external-full-page-layout')
    const host = document.querySelector('[data-testid="external-student-main"]')
    const pageRoot = host?.shadowRoot?.querySelector('.page-root') || null
    const app = host?.shadowRoot?.querySelector('#app') || null
    const canvas = host?.shadowRoot?.querySelector('#app canvas') || null
    const nodeLayer = host?.shadowRoot?.querySelector('#tree-nodes') || null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      bodyBackground: window.getComputedStyle(document.body).backgroundColor,
      rightEdgeTag: rightEdgeElement?.tagName || null,
      rightEdgeId: rightEdgeElement?.id || '',
      rightEdgeClassName: String(rightEdgeElement?.className || ''),
      rects: {
        layout: rectOf(layout),
        host: rectOf(host),
        pageRoot: rectOf(pageRoot),
        app: rectOf(app),
        canvas: rectOf(canvas),
        nodeLayer: rectOf(nodeLayer)
      },
      overflowNodes: collectOverflowNodes(document, 'document'),
      horizontalScrollContainers: collectHorizontalScrollContainers(document, 'document')
    }
  })

  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyBackground).toBe('rgb(0, 0, 0)')
  expect(['BODY', 'HTML', null]).not.toContain(coverage.rightEdgeTag)
  expect(coverage.overflowNodes, JSON.stringify(coverage.overflowNodes, null, 2)).toEqual([])
  expect(coverage.horizontalScrollContainers, JSON.stringify(coverage.horizontalScrollContainers, null, 2)).toEqual([])

  for (const [name, rect] of Object.entries(coverage.rects)) {
    expect(rect, `${name} rect exists`).not.toBeNull()
    expect(rect?.left, `${name} starts at viewport left`).toBeGreaterThanOrEqual(-1)
    expect(rect?.right, `${name} covers viewport right edge`).toBeGreaterThanOrEqual(coverage.viewportWidth - 1)
    expect(rect?.width, `${name} width does not exceed viewport`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  }

  expect(coverage.rects.pageRoot?.position).toBe('fixed')
  expect(coverage.rects.nodeLayer?.position).toBe('fixed')
}

async function assertTeacherMainViewportCoverage(page: Page) {
  const coverage = await page.evaluate((expectedHotspotIds) => {
    type OverflowNode = {
      root: string
      tag: string
      id: string
      className: string
      left: number
      right: number
      width: number
      overflowX: string
    }

    const rectOf = (element: Element | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        position: style.position,
        transform: style.transform,
        zoom: style.getPropertyValue('zoom') || '1',
        backgroundColor: style.backgroundColor,
        overflowX: style.overflowX,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth
      }
    }

    const collectHorizontalScrollContainers = (root: Document | ShadowRoot, label: string, nodes: OverflowNode[] = []) => {
      root.querySelectorAll('*').forEach((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        if (!visible) return

        const className = typeof element.className === 'string' ? element.className : String(element.className || '')
        const hasNativeHorizontalScrollbar =
          style.overflowX === 'scroll' || (style.overflowX === 'auto' && element.scrollWidth > element.clientWidth + 1)
        if (hasNativeHorizontalScrollbar || rect.right > window.innerWidth + 1 || rect.left < -1) {
          nodes.push({
            root: label,
            tag: element.tagName,
            id: element.id,
            className,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            overflowX: style.overflowX
          })
        }

        const shadowRoot = (element as HTMLElement).shadowRoot
        if (shadowRoot) collectHorizontalScrollContainers(shadowRoot, `${label} > ${element.tagName}.${element.id || 'shadow'}`, nodes)
      })
      return nodes
    }

    const host = document.querySelector('[data-testid="external-teacher-vanilla-host"]') as HTMLElement | null
    const shadowRoot = host?.shadowRoot || null
    const pageRoot = shadowRoot?.querySelector('[data-testid="external-teacher-main"]') || null
    const app = shadowRoot?.querySelector('#app') || null
    const blackhole = shadowRoot?.querySelector('#blackhole-bg') || null
    const topNav = shadowRoot?.querySelector('.top-nav') || null
    const sidebar = shadowRoot?.querySelector('.feature-sidebar') || null
    const nodeLayer = shadowRoot?.querySelector('.tree-interactive-nodes') || null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number.parseFloat(style.opacity || '1') > 0.01
    }
    const intersects = (
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number }
    ) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    const nodes = shadowRoot
      ? [...shadowRoot.querySelectorAll('.tree-node')]
          .filter(isVisible)
          .map((element) => ({
            id: (element as HTMLElement).dataset.featureId || '',
            ...rectOf(element)!
          }))
      : []
    const orderedNodes = expectedHotspotIds.map((id) => nodes.find((node) => node.id === id)).filter(Boolean) as typeof nodes
    const topNavRect = topNav ? rectOf(topNav) : null
    const menuRects = shadowRoot
      ? [...shadowRoot.querySelectorAll('.feature-category__button, .feature-item')]
          .filter(isVisible)
          .map((element) => ({ text: element.textContent?.trim() || '', ...rectOf(element)! }))
      : []
    let minDistance = Number.POSITIVE_INFINITY
    let nearestPair: string[] = []
    for (let i = 0; i < orderedNodes.length; i += 1) {
      for (let j = i + 1; j < orderedNodes.length; j += 1) {
        const a = orderedNodes[i]
        const b = orderedNodes[j]
        const ax = a.left + a.width / 2
        const ay = a.top + a.height / 2
        const bx = b.left + b.width / 2
        const by = b.top + b.height / 2
        const distance = Math.hypot(ax - bx, ay - by)
        if (distance < minDistance) {
          minDistance = distance
          nearestPair = [a.id, b.id]
        }
      }
    }

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      bodyBackground: window.getComputedStyle(document.body).backgroundColor,
      rightEdgeTag: rightEdgeElement?.tagName || null,
      hasShadowRoot: Boolean(shadowRoot),
      rects: {
        host: rectOf(host),
        pageRoot: rectOf(pageRoot),
        app: rectOf(app),
        blackhole: rectOf(blackhole),
        topNav: rectOf(topNav),
        sidebar: rectOf(sidebar),
        nodeLayer: rectOf(nodeLayer)
      },
      hotspots: {
        count: nodes.length,
        ids: orderedNodes.map((node) => node.id),
        minDistance,
        nearestPair,
        topNavOverlaps: topNavRect ? orderedNodes.filter((node) => intersects(node, topNavRect)).map((node) => node.id) : [],
        menuOverlaps: orderedNodes.flatMap((node) =>
          menuRects.filter((menu) => intersects(node, menu)).map((menu) => ({ node: node.id, menu: menu.text }))
        ),
        outOfViewport: orderedNodes
          .filter((node) => node.left < 0 || node.top < 0 || node.right > window.innerWidth || node.bottom > window.innerHeight)
          .map((node) => node.id)
      },
      horizontalScrollContainers: collectHorizontalScrollContainers(document, 'document')
    }
  }, teacherMainHotspotIds)

  expect(coverage.hasShadowRoot).toBeTruthy()
  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.bodyWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.rects.pageRoot?.backgroundColor).toBe('rgb(0, 0, 0)')
  expect(coverage.horizontalScrollContainers, JSON.stringify(coverage.horizontalScrollContainers, null, 2)).toEqual([])

  for (const [name, rect] of Object.entries(coverage.rects)) {
    expect(rect, `${name} rect exists`).not.toBeNull()
    expect(rect?.left, `${name} starts inside viewport`).toBeGreaterThanOrEqual(-1)
    expect(rect?.right, `${name} does not exceed viewport right edge`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.width, `${name} width does not exceed viewport`).toBeLessThanOrEqual(coverage.viewportWidth + 1)
    expect(rect?.scrollWidth, `${name} has no horizontal overflow`).toBeLessThanOrEqual((rect?.clientWidth || 0) + 1)
  }

  expect(coverage.rects.pageRoot?.left, 'pageRoot covers viewport left edge').toBeLessThanOrEqual(1)
  expect(coverage.rects.pageRoot?.right, 'pageRoot covers viewport right edge').toBeGreaterThanOrEqual(coverage.viewportWidth - 1)
  expect(coverage.rects.blackhole?.left, 'blackhole covers viewport left edge').toBeLessThanOrEqual(1)
  expect(coverage.rects.blackhole?.right, 'blackhole covers viewport right edge').toBeGreaterThanOrEqual(coverage.viewportWidth - 1)

  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(coverage.rects.pageRoot?.transform)
  const zoom = !coverage.rects.pageRoot?.zoom || coverage.rects.pageRoot.zoom === 'normal' ? 1 : Number.parseFloat(coverage.rects.pageRoot.zoom)
  expect(zoom).toBeCloseTo(1)
  expect(coverage.hotspots.count).toBe(teacherMainHotspotIds.length)
  expect(coverage.hotspots.ids).toEqual(teacherMainHotspotIds)
  expect(coverage.hotspots.minDistance).toBeGreaterThan(48)
  expect(coverage.hotspots.topNavOverlaps, JSON.stringify(coverage.hotspots.topNavOverlaps, null, 2)).toEqual([])
  expect(coverage.hotspots.menuOverlaps, JSON.stringify(coverage.hotspots.menuOverlaps, null, 2)).toEqual([])
  expect(coverage.hotspots.outOfViewport, JSON.stringify(coverage.hotspots.outOfViewport, null, 2)).toEqual([])
}

async function assertLoadingRoute(page: Page) {
  await page.evaluate(() => {
    window.localStorage.setItem('edugenie_access_token', 'layout-loading-token')
  })

  let releaseRoute: (() => void) | null = null
  let routeDone: Promise<void> = Promise.resolve()
  const routeSeen = new Promise<void>((resolveSeen) => {
    page.route('**/api/v1/auth/me', async (route) => {
      resolveSeen()
      const releasePromise = new Promise<void>((resolveRelease) => {
        releaseRoute = resolveRelease
      })
      routeDone = (async () => {
        await releasePromise
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({
            code: 0,
            message: 'success',
            data: {
              id: 1001,
              username: 'layout_student',
              email: 'layout.student@example.com',
              role: 'student',
              is_active: true
            },
            request_id: 'layout-loading'
          })
        }).catch(() => undefined)
      })()
      await routeDone
    }, { times: 1 })
  })

  await gotoAuthLoading(page)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-loading-page')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('external-loading-visual')).toBeVisible()
  await expect(page.locator('.loading-core')).toBeVisible()
  await expect(page.locator('.loading-canvas canvas')).toBeVisible()
  await expect(page.locator('.loading-text')).toContainText('Loading')
  await routeSeen
  await assertRouteMetrics(page, page.getByTestId('external-loading-page'))
  await expectNoVisibleOverlap(page, ['.loading-canvas', '.loading-copy'])

  return async () => {
    releaseRoute?.()
    await routeDone
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined)
  }
}

async function assertRouteMetrics(page: Page, root: Locator) {
  const metrics = await root.evaluate((element) => {
    const style = window.getComputedStyle(element as HTMLElement)
    return {
      transform: style.transform,
      zoom: style.getPropertyValue('zoom') || '1',
      rootWidth: (element as HTMLElement).scrollWidth,
      rootClientWidth: (element as HTMLElement).clientWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      viewportHeight: window.innerHeight
    }
  })

  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(metrics.transform)
  const zoom = !metrics.zoom || metrics.zoom === 'normal' ? 1 : Number.parseFloat(metrics.zoom)
  expect(zoom).toBeCloseTo(1)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 4)
  expect(metrics.rootWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 8)

  if (metrics.documentHeight > metrics.viewportHeight + 24) {
    const canScroll = await page.evaluate(async () => {
      const before = window.scrollY
      window.scrollTo(0, Math.min(160, document.documentElement.scrollHeight - window.innerHeight))
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      const after = window.scrollY
      window.scrollTo(0, before)
      return after > before
    })
    expect(canScroll).toBeTruthy()
  }
}

async function expectNoVisibleOverlap(page: Page, selectors: string[]) {
  const boxes = await Promise.all(selectors.map(async (selector) => ({ selector, box: await visibleBox(page.locator(selector).first()) })))
  const visibleBoxes = boxes.filter((item): item is { selector: string; box: NonNullable<typeof item.box> } => Boolean(item.box))
  for (let i = 0; i < visibleBoxes.length; i += 1) {
    for (let j = i + 1; j < visibleBoxes.length; j += 1) {
      expect(overlapArea(visibleBoxes[i].box, visibleBoxes[j].box), `${visibleBoxes[i].selector} overlaps ${visibleBoxes[j].selector}`).toBeLessThanOrEqual(2)
    }
  }
}

async function visibleBox(locator: Locator) {
  if ((await locator.count()) === 0) return null
  const visible = await locator.isVisible().catch(() => false)
  if (!visible) return null
  return locator.boundingBox()
}

function overlapArea(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return x * y
}

async function saveLayoutScreenshot(page: Page, name: string) {
  const dir = path.resolve(process.cwd(), 'test-results', 'screenshots', 'layout-audit')
  await fs.mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
}

function slug(route: string) {
  return route.replace(/^\//, '').replace(/[^\w]+/g, '-')
}
