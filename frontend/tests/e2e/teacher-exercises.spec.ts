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

test.use({ viewport: { width: 1920, height: 1080 } })

test('external exercise_generation page replaces /teacher/exercises and uses real /api/v1 APIs', async ({ page }) => {
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
  await expect(page.getByText('/api/v1')).toHaveCount(0)
  await expect(page.getByText('后端未返回')).toHaveCount(0)
  await expect(page.getByText(/mock|fallback/i)).toHaveCount(0)
  await expect(page.locator('.top-nav')).toBeVisible()
  await expect(page.locator('.workbench-hero')).toContainText('习题生成')
  await expect(page.locator('.workbench-subtitle')).toContainText('AI-DRIVEN EXERCISE GENERATION')
  await expect(page.locator('.exercise-prism-background')).toBeVisible()
  await expect(page.locator('#exerciseCourseName')).toBeVisible()
  await expect(page.locator('#exerciseKnowledgePoints')).toBeVisible()
  await expect(page.locator('#exerciseQuestionTypes')).toBeVisible()
  await expect(page.locator('#exerciseQuestionCount')).toBeVisible()
  await expect(page.locator('#exerciseReferenceContent')).toBeVisible()
  await expect(page.locator('.reference-file-picker')).toBeVisible()

  const layoutMetrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="external-teacher-exercise-generation-host"]')
    const root = host?.shadowRoot
    const pageRoot = root?.querySelector('[data-testid="external-teacher-exercise-generation"]') as HTMLElement | null
    const topNav = root?.querySelector('.top-nav') as HTMLElement | null
    const shell = root?.querySelector('.workbench-shell') as HTMLElement | null
    const hero = root?.querySelector('.workbench-hero') as HTMLElement | null
    const style = pageRoot ? window.getComputedStyle(pageRoot) : null
    const topNavRect = topNav?.getBoundingClientRect()
    const shellRect = shell?.getBoundingClientRect()
    const heroRect = hero?.getBoundingClientRect()

    return {
      transform: style?.transform ?? '',
      zoom: Number.parseFloat(style?.zoom || '1'),
      topNavHeight: topNavRect?.height ?? 0,
      heroTop: heroRect?.top ?? 0,
      topNavBottom: topNavRect?.bottom ?? 0,
      shellLeft: shellRect?.left ?? 0,
      shellWidth: shellRect?.width ?? 0,
      viewportWidth: window.innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    }
  })
  expect(layoutMetrics.transform === 'none' || !layoutMetrics.transform.includes('matrix')).toBeTruthy()
  expect(layoutMetrics.zoom).toBeGreaterThanOrEqual(1)
  expect(layoutMetrics.topNavHeight).toBeGreaterThanOrEqual(70)
  expect(layoutMetrics.heroTop).toBeGreaterThan(layoutMetrics.topNavBottom)
  expect(layoutMetrics.shellLeft).toBeGreaterThan(40)
  expect(layoutMetrics.shellWidth).toBeLessThan(layoutMetrics.viewportWidth)
  expect(layoutMetrics.horizontalOverflow).toBeFalsy()

  const suffix = Date.now()
  await page.locator('#exerciseCourseName').fill(`E2E 外部习题 ${suffix}`)
  await page.locator('#exerciseKnowledgePoints').fill('RAG 检索增强, 学习路径推进, 生成质量分析')
  await page.locator('#exerciseQuestionTypes').fill('单选题, 判断题, 简答题')
  await page.locator('#exerciseQuestionCount').fill('6')
  await page.locator('#exerciseReferenceContent').fill('围绕 PrismMind 课程知识库、学生画像和学习评估闭环设计练习题。')
  await page.locator('.reference-file-native-input').setInputFiles({
    name: `exercise-reference-${suffix}.txt`,
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
  await uploadResponse
  await generateResponse
  await expect(page.getByTestId('external-teacher-exercise-result')).toBeVisible({ timeout: 80_000 })
  await expect(page.getByTestId('external-teacher-exercise-quality')).toBeVisible()
  await expect(page.getByTestId('external-teacher-exercise-markdown')).toContainText(/答案|参考答案/)
  await expect(page.getByTestId('external-teacher-exercise-markdown')).toContainText(/解析|说明/)

  const historyResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/generated-artifacts') &&
    response.url().includes('artifact_type=exercise') &&
    response.request().method() === 'GET' &&
    response.ok()
  )
  await page.getByRole('button', { name: /管理我的习题/ }).click()
  await historyResponse
  await expect(page.getByTestId('external-teacher-exercise-history')).toBeVisible({ timeout: 20_000 })

  await gotoApp(page, '/teacher/dashboard')
  await page.locator('.feature-category__button[data-category-id="teaching-center"]').click()
  const exerciseEntry = page.locator('.feature-item[data-feature-id="exercise-generate"]')
  await exerciseEntry.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await expect(page.locator('.enter-btn')).toBeVisible({ timeout: 10_000 })
  await page.locator('.enter-btn').click({ force: true })
  await expect(page).toHaveURL(/\/teacher\/exercises$/)
  await expect(page.getByTestId('external-teacher-exercise-generation')).toBeVisible()

  await saveScreenshot(page, 'teacher-external-exercises')
  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
