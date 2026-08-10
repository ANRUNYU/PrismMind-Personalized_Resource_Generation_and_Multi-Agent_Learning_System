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
  '/api/exercise-generation/generate',
  '/api/exercise-generation/upload-reference',
  '/api/exercise-generation/my-exercises',
  '/api/exercise-generation/save',
  '/api/exercises/generate',
  '/api/generate/exercises',
  '/api/teacher/exercises',
  'localhost:3000',
  'localhost:5000',
  'localhost:8080'
]

test.use({ viewport: { width: 1366, height: 768 } })

test('exercise_generation external page fully replaces teacher exercise route', async ({ page }) => {
  test.setTimeout(240_000)
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    const pathname = new URL(url).pathname
    if (forbiddenRuntimePatterns.some((pattern) => url.includes(pattern))) forbiddenRequests.push(url)
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/')) forbiddenRequests.push(url)
  })

  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/teacher/exercises')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-exercise-generation')).toBeVisible()
  await expect(page.getByTestId('external-teacher-exercises')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.locator('.teacher-generation-page')).toHaveCount(0)
  await expect(page.locator('.change-shell, [data-testid="ChangeShell"]')).toHaveCount(0)
  await expect(page.getByText('/api/v1')).toHaveCount(0)
  await expect(page.getByText('后端未返回')).toHaveCount(0)
  await expect(page.getByText(/mock|fallback/i)).toHaveCount(0)

  const layoutMetrics = await page.getByTestId('external-teacher-exercise-generation-host').evaluate((host) => {
    const shadowRoot = host.shadowRoot
    const pageRoot = shadowRoot?.querySelector('[data-testid="external-teacher-exercise-generation"]') as HTMLElement | null
    const layout = document.querySelector('[data-testid="external-full-page-layout"]') as HTMLElement | null
    const topNav = shadowRoot?.querySelector('.top-nav') as HTMLElement | null
    const style = pageRoot ? getComputedStyle(pageRoot) : null
    const layoutStyle = layout ? getComputedStyle(layout) : null
    const rootRect = pageRoot?.getBoundingClientRect()
    const topNavRect = topNav?.getBoundingClientRect()
    const activeButton = shadowRoot?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null

    return {
      transform: style?.transform || '',
      zoom: style?.getPropertyValue('zoom') || '1',
      rootWidth: rootRect?.width || 0,
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      layoutClass: layout?.className || '',
      layoutBackground: layoutStyle?.backgroundColor || '',
      layoutScrollbarGutter: layoutStyle?.scrollbarGutter || '',
      topNavCount: shadowRoot?.querySelectorAll('.top-nav').length || 0,
      topNavHeight: topNavRect?.height || 0,
      brandStrongText: topNav?.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: topNav?.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      buttonsText: [...(topNav?.querySelectorAll('.top-nav-button') || [])].map((button) => button.textContent?.trim() || ''),
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || ''
    }
  })

  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(layoutMetrics.transform)
  const zoom = !layoutMetrics.zoom || layoutMetrics.zoom === 'normal' ? 1 : Number.parseFloat(layoutMetrics.zoom)
  expect(zoom).toBeCloseTo(1)
  expect(layoutMetrics.documentWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 4)
  expect(layoutMetrics.bodyWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 4)
  expect(layoutMetrics.rootWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 4)
  expect(layoutMetrics.layoutClass).toContain('external-full-page-layout--teacher-exercise-generation')
  expect(layoutMetrics.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(layoutMetrics.layoutScrollbarGutter).toContain('auto')
  expect(layoutMetrics.topNavCount).toBe(1)
  expect(layoutMetrics.topNavHeight).toBeGreaterThanOrEqual(70)
  expect(layoutMetrics.brandStrongText).toContain('棱镜智教')
  expect(layoutMetrics.brandEmText).toContain('PrismMind')
  expect(layoutMetrics.buttonsText).toEqual(['首页', '返回', '用户', '退出'])
  expect(layoutMetrics.activeUnderlineOpacity).toBe('0.72')
  expect(layoutMetrics.activeUnderlineHeight).toBe('1px')
  expect(layoutMetrics.activeDotOpacity).toBe('0.5')
  expect(layoutMetrics.activeDotWidth).toBe('5px')
  expect(layoutMetrics.activeDotHeight).toBe('5px')

  const suffix = Date.now()
  await page.locator('#exerciseCourseName').fill(`E2E 习题批量生成 ${suffix}`)
  await page.locator('#exerciseKnowledgePoints').fill('知识图谱检索, 生成质量分析, 个性化练习')
  await page.locator('#exerciseQuestionTypes').fill('单选题, 判断题, 简答题')
  await page.locator('#exerciseQuestionCount').fill('6')
  await page.locator('#exerciseReferenceContent').fill('围绕 PrismMind 课程知识库、学生画像和学习评估闭环设计练习题。')
  await page.locator('.reference-file-native-input').setInputFiles({
    name: `exercise-generation-reference-${suffix}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('PrismMind exercise generation reference for E2E.')
  })

  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/files/upload') && response.request().method() === 'POST' && response.ok()
  )
  const generateResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/exercises/generate') &&
    response.request().method() === 'POST' &&
    response.ok()
  )
  await page.locator('[data-testid="external-teacher-exercise-generation"] .primary-action').click()
  const preparationProgress = page
    .locator(
      '[data-testid="exercise-generation-progress"], [data-testid="teacher-task-progress"]',
    )
    .first()
  await expect(preparationProgress).toBeVisible()
  await expect(preparationProgress.getByRole('progressbar')).toBeVisible()
  await expect(preparationProgress).toContainText(/%/)
  await uploadResponse
  await generateResponse
  const taskProgress = page.getByTestId('teacher-task-progress')
  await expect(taskProgress).toBeVisible({ timeout: 20_000 })
  await expect(taskProgress.getByRole('progressbar')).toBeVisible()
  await expect(taskProgress).toContainText('100%', { timeout: 180_000 })
  await expect(taskProgress.locator('.task-partial-content')).not.toBeEmpty()
  const artifactLink = taskProgress.getByRole('link', { name: '查看生成资源详情' })
  await expect(artifactLink).toBeVisible()
  await expect(artifactLink).toHaveAttribute('href', /\/teacher\/generated-artifacts\/\d+$/)

  await page.locator('.top-nav-left .top-nav-button').first().click()
  await expect(page).toHaveURL(/\/teacher\/dashboard$/)
  await gotoApp(page, '/teacher/exercises')
  await expect(page.getByTestId('external-teacher-exercise-generation')).toBeVisible()
  await page.evaluate(() => {
    localStorage.setItem('access_token', 'probe')
    localStorage.setItem('refresh_token', 'probe')
    localStorage.setItem('prismmind_probe', 'probe')
    localStorage.setItem('edugenie_probe', 'probe')
    sessionStorage.setItem('prismmind_session_probe', 'probe')
    sessionStorage.setItem('edugenie_session_probe', 'probe')
  })
  await page.locator('.top-nav-right .top-nav-button').last().click()
  await expect(page).toHaveURL(/\/auth\/login/)
  const storageAfterLogout = await page.evaluate(() => ({
    accessToken: localStorage.getItem('access_token'),
    refreshToken: localStorage.getItem('refresh_token'),
    prismmindProbe: localStorage.getItem('prismmind_probe'),
    edugenieProbe: localStorage.getItem('edugenie_probe'),
    prismmindSessionProbe: sessionStorage.getItem('prismmind_session_probe'),
    edugenieSessionProbe: sessionStorage.getItem('edugenie_session_probe')
  }))
  expect(storageAfterLogout).toEqual({
    accessToken: null,
    refreshToken: null,
    prismmindProbe: null,
    edugenieProbe: null,
    prismmindSessionProbe: null,
    edugenieSessionProbe: null
  })

  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
