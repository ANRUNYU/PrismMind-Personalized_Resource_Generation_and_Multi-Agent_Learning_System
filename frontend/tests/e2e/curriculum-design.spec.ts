import { expect, test } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  expectExternalFullPage,
  expectNoPageIssues,
  gotoApp,
  loginViaUI
} from './helpers'

const forbiddenRuntimePatterns = [
  '/api/curriculum-design/generate',
  '/api/curriculum-design/upload-reference',
  '/api/curriculum-design/my-designs',
  '/api/curriculum-design/save',
  '/api/course-design/generate',
  '/api/course-designs/generate',
  '/api/generate/course-design',
  'localhost:3000',
  'localhost:5000',
  'localhost:8080'
]

test.use({ viewport: { width: 1366, height: 768 } })

test('curriculum_design external page fully replaces teacher course design route', async ({ page }) => {
  test.setTimeout(180_000)
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    const pathname = new URL(url).pathname
    if (forbiddenRuntimePatterns.some((pattern) => url.includes(pattern))) forbiddenRequests.push(url)
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/')) forbiddenRequests.push(url)
  })

  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/teacher/course-designs')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-curriculum-design')).toBeVisible()
  await expect(page.getByTestId('external-teacher-course-designs')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.locator('text=ChangeShell')).toHaveCount(0)
  await expect(page.getByText('/api/v1')).toHaveCount(0)
  await expect(page.locator('text=后端未返回')).toHaveCount(0)
  await expect(page.locator('text=mock')).toHaveCount(0)
  await expect(page.locator('text=fallback')).toHaveCount(0)

  await expect(page.locator('.top-nav')).toHaveCount(1)
  await expect(page.locator('.top-brand-name strong')).toHaveText('棱镜智教')
  await expect(page.locator('.top-brand-name em')).toHaveText('PrismMind')
  await expect(page.locator('.top-nav-left .top-nav-button')).toHaveCount(2)
  await expect(page.locator('.top-nav-right .top-nav-button')).toHaveCount(2)
  await expect(page.locator('.workbench-hero')).toContainText('智能课程设计方案')
  await expect(page.locator('.curriculum-action-panel')).toBeVisible()
  await expect(page.locator('.curriculum-prism-background')).toBeVisible()

  const layoutMetrics = await page.getByTestId('external-teacher-curriculum-design-host').evaluate((host) => {
    const shadowRoot = host.shadowRoot
    const root = shadowRoot?.querySelector('[data-testid="external-teacher-curriculum-design"]') as HTMLElement | null
    const externalLayout = document.querySelector('.external-full-page-layout') as HTMLElement | null
    const topNav = shadowRoot?.querySelector('.top-nav') as HTMLElement | null
    const formPanel = shadowRoot?.querySelector('.workbench-panel--form') as HTMLElement | null
    const previewPanel = shadowRoot?.querySelector('.workbench-panel--preview:last-child') as HTMLElement | null
    const activeButton = shadowRoot?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    const rootStyle = root ? getComputedStyle(root) : null
    const layoutStyle = externalLayout ? getComputedStyle(externalLayout) : null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 2, Math.floor(window.innerHeight / 2)) as HTMLElement | null
    const rightEdgeStyle = rightEdgeElement ? getComputedStyle(rightEdgeElement) : null
    return {
      rootTransform: rootStyle?.transform || '',
      rootZoom: rootStyle?.getPropertyValue('zoom') || '1',
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      layoutClassName: externalLayout?.className || '',
      layoutBackground: layoutStyle?.backgroundColor || '',
      layoutOverflowX: layoutStyle?.overflowX || '',
      layoutScrollbarGutter: layoutStyle?.scrollbarGutter || '',
      rightEdgeTag: rightEdgeElement?.tagName || null,
      rightEdgeBackground: rightEdgeStyle?.backgroundColor || '',
      topNavCount: shadowRoot?.querySelectorAll('.top-nav').length ?? 0,
      topNavHeight: topNav?.getBoundingClientRect().height || 0,
      formRight: formPanel?.getBoundingClientRect().right || 0,
      previewRight: previewPanel?.getBoundingClientRect().right || 0,
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || ''
    }
  })

  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(layoutMetrics.rootTransform)
  const zoom = !layoutMetrics.rootZoom || layoutMetrics.rootZoom === 'normal' ? 1 : Number.parseFloat(layoutMetrics.rootZoom)
  expect(zoom).toBeCloseTo(1)
  expect(layoutMetrics.documentWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 2)
  expect(layoutMetrics.bodyWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 2)
  expect(layoutMetrics.layoutClassName).toContain('external-full-page-layout--teacher-curriculum-design')
  expect(layoutMetrics.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(['clip', 'hidden']).toContain(layoutMetrics.layoutOverflowX)
  expect(layoutMetrics.layoutScrollbarGutter).toBe('auto')
  expect(layoutMetrics.rightEdgeBackground).not.toBe('rgb(2, 6, 23)')
  expect(['BODY', 'HTML', null]).not.toContain(layoutMetrics.rightEdgeTag)
  expect(layoutMetrics.topNavCount).toBe(1)
  expect(layoutMetrics.topNavHeight).toBeGreaterThanOrEqual(70)
  expect(layoutMetrics.formRight).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 1)
  expect(layoutMetrics.previewRight).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 1)
  expect(layoutMetrics.activeUnderlineOpacity).toBe('0.72')
  expect(layoutMetrics.activeUnderlineHeight).toBe('1px')
  expect(layoutMetrics.activeDotOpacity).toBe('0.5')
  expect(layoutMetrics.activeDotWidth).toBe('5px')
  expect(layoutMetrics.activeDotHeight).toBe('5px')

  const suffix = Date.now()
  await page.locator('#courseTopic').fill(`E2E curriculum design ${suffix}`)
  await page.locator('#targetLearners').fill('计算机专业本科生')
  await page.locator('#totalHours').fill('32')
  await page.locator('#learningObjectives').fill('理解课程知识图谱\n掌握 RAG 课程资源组织\n完成项目化教学评价设计')
  await page.locator('#additionalRequirements').fill('强调过程评价、分层任务和教学资源建议。')

  const generateResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/course-designs/generate') &&
    response.request().method() === 'POST' &&
    response.ok()
  )
  await page.locator('#submitButton').click()
  const curriculumProgress = page.getByTestId('teacher-task-progress')
  await expect(curriculumProgress).toBeVisible()
  await expect(curriculumProgress.getByRole('progressbar')).toBeVisible()
  await expect(curriculumProgress).toContainText(/%/)
  await generateResponse
  await expect(page.getByTestId('external-teacher-curriculum-design-result')).toBeVisible({ timeout: 80_000 })
  await expect(page.getByTestId('external-teacher-curriculum-design-quality')).toBeVisible()
  await expect(
    page
      .getByTestId('external-teacher-curriculum-design-result')
      .locator('.curriculum-markdown'),
  ).not.toBeEmpty()

  await page.locator('[data-action="save-result"]').click()
  await expect(page.locator('#statusConsole')).toContainText('已保存')

  const downloadPromise = page.waitForEvent('download')
  await page.locator('[data-action="export-result"]').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.md$/)

  const historyResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/generated-artifacts') &&
    response.url().includes('artifact_type=course_design') &&
    response.request().method() === 'GET' &&
    response.ok()
  )
  await page.locator('#manageDesignsButton').click()
  await historyResponse
  await expect(page.getByTestId('external-teacher-curriculum-design-history')).toBeVisible()

  await page.locator('.top-nav-left .top-nav-button').first().click()
  await expect(page).toHaveURL(/\/teacher\/dashboard$/)

  await gotoApp(page, '/teacher/course-designs')
  await page.evaluate(() => {
    localStorage.setItem('access_token', 'curriculum-design-access')
    localStorage.setItem('refresh_token', 'curriculum-design-refresh')
    localStorage.setItem('prismmind_probe', 'curriculum-design-prism')
    localStorage.setItem('edugenie_probe', 'curriculum-design-edu')
    sessionStorage.setItem('prismmind_probe', 'curriculum-design-session')
  })
  await page.locator('.top-nav-right .top-nav-button').nth(1).click()
  await expect(page).toHaveURL(/\/auth\/login/)
  const remainingAuthStorage = await page.evaluate(() => ({
    accessToken: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
    prismmind: localStorage.getItem('prismmind_probe'),
    edugenie: localStorage.getItem('edugenie_probe'),
    sessionPrismmind: sessionStorage.getItem('prismmind_probe')
  }))
  expect(remainingAuthStorage).toEqual({
    accessToken: null,
    refreshToken: null,
    prismmind: null,
    edugenie: null,
    sessionPrismmind: null
  })

  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
