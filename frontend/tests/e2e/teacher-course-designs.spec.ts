import { expect, test } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  expectExternalFullPage,
  expectNoPageIssues,
  gotoApp,
  loginViaUI,
  saveScreenshot
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

test.use({ viewport: { width: 1920, height: 1080 } })

test('external curriculum_design page replaces /teacher/course-designs and uses real /api/v1 APIs', async ({ page }) => {
  test.setTimeout(160_000)
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
  await expect(page.getByTestId('external-teacher-course-design')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.locator('text=ChangeShell')).toHaveCount(0)
  await expect(page.locator('text=后端未返回')).toHaveCount(0)
  await expect(page.getByText('/api/v1')).toHaveCount(0)
  await expect(page.locator('text=mock')).toHaveCount(0)
  await expect(page.locator('text=fallback')).toHaveCount(0)
  await expect(page.locator('.top-nav')).toBeVisible()
  await expect(page.locator('.top-brand-name strong')).toHaveText('棱镜智教')
  await expect(page.locator('.top-brand-name em')).toHaveText('PrismMind')
  await expect(page.locator('.workbench-hero')).toContainText('智能课程设计方案')
  await expect(page.locator('.workbench-subtitle')).toContainText('AI-DRIVEN CURRICULUM DESIGN')
  await expect(page.locator('.workbench-hero')).toContainText('智能生成结构化、高质量、可实践的课程设计方案')
  await expect(page.locator('.curriculum-action-panel')).toBeVisible()
  await expect(page.locator('.workflow-steps')).toBeVisible()
  await expect(page.locator('.workbench-stack')).toContainText('设计提示 / 教学建议')
  await expect(page.locator('.guidance-grid')).toContainText('对齐学习目标')
  await expect(page.locator('#designPreview')).toBeVisible()
  await expect(page.locator('#manageDesignsButton')).toBeVisible()
  await expect(page.locator('.curriculum-prism-background')).toBeVisible()

  const layoutMetrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="external-teacher-curriculum-design-host"]')
    const root = host?.shadowRoot
    const pageRoot = root?.querySelector('[data-testid="external-teacher-curriculum-design"]') as HTMLElement | null
    const topNav = root?.querySelector('.top-nav') as HTMLElement | null
    const shell = root?.querySelector('.workbench-shell') as HTMLElement | null
    const hero = root?.querySelector('.workbench-hero') as HTMLElement | null
    const externalLayout = document.querySelector('.external-full-page-layout') as HTMLElement | null
    const style = pageRoot ? window.getComputedStyle(pageRoot) : null
    const externalLayoutStyle = externalLayout ? window.getComputedStyle(externalLayout) : null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 2, Math.floor(window.innerHeight / 2)) as HTMLElement | null
    const rightEdgeStyle = rightEdgeElement ? window.getComputedStyle(rightEdgeElement) : null
    const topNavRect = topNav?.getBoundingClientRect()
    const shellRect = shell?.getBoundingClientRect()
    const heroRect = hero?.getBoundingClientRect()

    return {
      transform: style?.transform ?? '',
      zoom: Number.parseFloat(style?.zoom || '1'),
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      layoutClassName: externalLayout?.className || '',
      layoutBackground: externalLayoutStyle?.backgroundColor || '',
      layoutOverflowX: externalLayoutStyle?.overflowX || '',
      layoutScrollbarGutter: externalLayoutStyle?.scrollbarGutter || '',
      rightEdgeTag: rightEdgeElement?.tagName || null,
      rightEdgeBackground: rightEdgeStyle?.backgroundColor || '',
      topNavHeight: topNavRect?.height ?? 0,
      heroTop: heroRect?.top ?? 0,
      topNavBottom: topNavRect?.bottom ?? 0,
      shellLeft: shellRect?.left ?? 0,
      shellWidth: shellRect?.width ?? 0,
      viewportWidth: window.innerWidth
    }
  })
  expect(layoutMetrics.transform === 'none' || !layoutMetrics.transform.includes('matrix')).toBeTruthy()
  expect(layoutMetrics.zoom).toBeGreaterThanOrEqual(1)
  expect(layoutMetrics.zoom).toBeCloseTo(1)
  expect(layoutMetrics.documentWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 2)
  expect(layoutMetrics.bodyWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 2)
  expect(layoutMetrics.layoutClassName).toContain('external-full-page-layout--teacher-curriculum-design')
  expect(layoutMetrics.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(['clip', 'hidden']).toContain(layoutMetrics.layoutOverflowX)
  expect(layoutMetrics.layoutScrollbarGutter).toBe('auto')
  expect(layoutMetrics.rightEdgeBackground).not.toBe('rgb(2, 6, 23)')
  expect(['BODY', 'HTML', null]).not.toContain(layoutMetrics.rightEdgeTag)
  expect(layoutMetrics.topNavHeight).toBeGreaterThanOrEqual(70)
  expect(layoutMetrics.heroTop).toBeGreaterThan(layoutMetrics.topNavBottom)
  expect(layoutMetrics.shellLeft).toBeGreaterThan(40)
  expect(layoutMetrics.shellWidth).toBeLessThan(layoutMetrics.viewportWidth)
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
  expect(hasHorizontalOverflow).toBeFalsy()

  const suffix = Date.now()
  await page.locator('#courseTopic').fill(`E2E 外部课程设计 ${suffix}`)
  await page.locator('#targetLearners').fill('计算机专业本科生')
  await page.locator('#totalHours').fill('32')
  await page.locator('#learningObjectives').fill('理解个性化学习资源生成\n掌握课程知识库检索增强\n能够设计学习评估闭环')
  await page.locator('#additionalRequirements').fill('强调项目式学习、过程性评价和知识库引用。')
  await page.locator('#referenceFile').setInputFiles({
    name: `course-design-reference-${suffix}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('PrismMind course design reference for E2E.')
  })

  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/files/upload') && response.request().method() === 'POST' && response.ok()
  )
  const generateResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/course-designs/generate') &&
    response.request().method() === 'POST' &&
    response.ok()
  )
  await page.locator('#submitButton').click()
  await uploadResponse
  await generateResponse
  await expect(page.getByTestId('external-teacher-curriculum-design-result')).toBeVisible({ timeout: 80_000 })
  await expect(page.getByTestId('external-teacher-curriculum-design-quality')).toBeVisible()
  await expect(page.locator('.curriculum-markdown')).not.toBeEmpty()

  const historyResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/generated-artifacts') &&
    response.url().includes('artifact_type=course_design') &&
    response.request().method() === 'GET' &&
    response.ok()
  )
  await page.locator('#manageDesignsButton').click()
  await historyResponse
  await expect(page.getByTestId('external-teacher-curriculum-design-history')).toBeVisible({ timeout: 20_000 })

  await gotoApp(page, '/teacher/dashboard')
  await page.locator('.feature-category__button[data-category-id="teaching-center"]').click()
  await page.locator('.feature-item[data-feature-id="course-design"]').click()
  await page.locator('.enter-btn').click()
  await expect(page).toHaveURL(/\/teacher\/course-designs$/)
  await expect(page.getByTestId('external-teacher-curriculum-design')).toBeVisible()

  await saveScreenshot(page, 'teacher-external-curriculum-design')
  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
