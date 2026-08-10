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
  '/api/exam-paper-generation/generate',
  '/api/exam-paper-generation/my-papers',
  '/api/exam-paper-generation/save',
  '/api/papers/generate',
  '/api/paper-generation/generate',
  '/api/generate/papers',
  '/api/teacher/papers',
  '/api/exam/generate',
  'localhost:3000',
  'localhost:5000',
  'localhost:8080'
]

test.use({ viewport: { width: 1920, height: 1080 } })

test('external test_generation page replaces /teacher/papers and uses real /api/v1 APIs', async ({ page }) => {
  test.setTimeout(260_000)
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    const pathname = new URL(url).pathname
    if (forbiddenRuntimePatterns.some((pattern) => url.includes(pattern))) forbiddenRequests.push(url)
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/')) forbiddenRequests.push(url)
  })

  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/teacher/papers')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-test-generation')).toBeVisible()
  await expect(page.getByTestId('external-teacher-papers')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.locator('.teacher-generation-page')).toHaveCount(0)
  await expect(page.locator('.top-nav')).toBeVisible()
  await expect(page.locator('.workbench-hero')).toContainText('试卷生成')
  await expect(page.locator('.workbench-subtitle')).toContainText('AI-DRIVEN EXAM PAPER GENERATION')
  await expect(page.locator('.paper-prism-background')).toBeVisible()
  await expect(page.locator('#paperCourseName')).toBeVisible()
  await expect(page.locator('#paperExamDuration')).toBeVisible()
  await expect(page.locator('#paperTotalScore')).toBeVisible()
  await expect(page.locator('#paperExamScope')).toBeVisible()
  await expect(page.locator('#paperDifficultyRatio')).toBeVisible()
  await expect(page.locator('#paperQuestionDistribution')).toBeVisible()
  await expect(page.locator('#paperReferenceDescription')).toBeVisible()
  await expect(page.locator('.reference-file-picker')).toBeVisible()

  const layoutMetrics = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="external-teacher-test-generation-host"]')
    const root = host?.shadowRoot
    const pageRoot = root?.querySelector('[data-testid="external-teacher-test-generation"]') as HTMLElement | null
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
  await page.locator('#paperCourseName').fill(`E2E 外部试卷 ${suffix}`)
  await page.locator('#paperExamDuration').fill('90分钟')
  await page.locator('#paperTotalScore').fill('100')
  await page.locator('#paperExamScope').fill('学生画像、课程知识库、RAG 辅导、生成质量分析与学习路径推荐。')
  await page.locator('#paperDifficultyRatio').fill('基础30%，中等50%，提高20%')
  await page.locator('#paperQuestionDistribution').fill('单项选择题：8题，每题3分\n简答题：4题，每题9分\n案例题：2题，每题20分')
  await page.locator('#paperReferenceDescription').fill('围绕 PrismMind 教师资源生成、学生学习闭环和知识库检索增强进行命题。')
  await page.locator('.reference-file-native-input').setInputFiles({
    name: `paper-reference-${suffix}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('PrismMind exam paper generation reference for E2E.')
  })

  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/files/upload') && response.request().method() === 'POST' && response.ok()
  )
  const generateResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/papers/generate') && response.request().method() === 'POST' && response.ok()
  )
  await page.locator('[data-testid="external-teacher-test-generation"] .primary-action').click()
  await uploadResponse
  await generateResponse
  await expect(page.getByTestId('external-teacher-paper-result')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('external-teacher-paper-quality')).toBeVisible()
  await expect(page.getByTestId('external-teacher-paper-markdown')).toContainText(/答案|参考答案|解析|评分/)

  const historyResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/generated-artifacts') &&
    response.url().includes('artifact_type=paper') &&
    response.request().method() === 'GET' &&
    response.ok()
  )
  await page.getByRole('button', { name: /管理我的试卷/ }).click()
  await historyResponse
  await expect(page.getByTestId('external-teacher-paper-history')).toBeVisible({ timeout: 20_000 })

  await gotoApp(page, '/teacher/dashboard')
  await page.locator('.feature-category__button[data-category-id="teaching-center"]').click()
  const paperEntry = page.locator('.feature-item[data-feature-id="paper-generate"]')
  await paperEntry.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await expect(page.locator('.enter-btn')).toBeVisible({ timeout: 10_000 })
  await page.locator('.enter-btn').click({ force: true })
  await expect(page).toHaveURL(/\/teacher\/papers$/)
  await expect(page.getByTestId('external-teacher-test-generation')).toBeVisible()

  await saveScreenshot(page, 'teacher-external-papers')
  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
