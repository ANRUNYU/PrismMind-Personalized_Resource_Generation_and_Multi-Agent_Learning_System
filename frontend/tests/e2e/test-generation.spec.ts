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
  '/api/test-generation/generate',
  '/api/paper-generation/generate',
  '/api/exam-generation/generate',
  '/api/exam-paper-generation/generate',
  '/api/exam-paper-generation/my-papers',
  '/api/exam-paper-generation/save',
  '/api/tests/generate',
  '/api/papers/generate',
  '/api/exams/generate',
  '/api/teacher/test-generation',
  '/api/teacher/tests',
  '/api/teacher/papers',
  '/api/teacher/exams',
  'localhost:3000',
  'localhost:5000',
  'localhost:8080'
]

test.use({ viewport: { width: 1366, height: 768 } })

test('teacher test_generation template is mounted on /teacher/papers with real APIs and safe layout', async ({ page }) => {
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
  await expect(page.locator('.main-layout__aside, .main-layout__header, .teacher-generation-page')).toHaveCount(0)
  await expect(page.locator('.top-nav')).toHaveCount(1)
  await expect(page.locator('.top-brand-name strong')).toContainText('核镜智教')
  await expect(page.locator('.top-brand-name em')).toContainText('Prism Mind')
  await expect(page.locator('.top-nav-button')).toHaveText(['首页', '返回', '用户', '退出'])
  await expect(page.locator('.workbench-hero')).toContainText('试卷生成')
  await expect(page.locator('.paper-prism-background')).toBeVisible()
  await expect(page.locator('#paperCourseName')).toBeVisible()
  await expect(page.locator('#paperExamDuration')).toBeVisible()
  await expect(page.locator('#paperTotalScore')).toBeVisible()
  await expect(page.locator('#paperExamScope')).toBeVisible()
  await expect(page.locator('#paperDifficultyRatio')).toBeVisible()
  await expect(page.locator('#paperQuestionDistribution')).toBeVisible()
  await expect(page.locator('#paperReferenceDescription')).toBeVisible()

  const layoutMetrics = await page.evaluate(() => {
    const layout = document.querySelector('[data-testid="external-full-page-layout"]') as HTMLElement | null
    const host = document.querySelector('[data-testid="external-teacher-test-generation-host"]') as HTMLElement | null
    const root = host?.shadowRoot
    const pageRoot = root?.querySelector('[data-testid="external-teacher-test-generation"]') as HTMLElement | null
    const pageStyle = pageRoot ? getComputedStyle(pageRoot) : null
    const layoutStyle = layout ? getComputedStyle(layout) : null
    const visibleText = pageRoot?.textContent || ''

    return {
      layoutClassName: layout?.className || '',
      layoutBackground: layoutStyle?.backgroundColor || '',
      pageTransform: pageStyle?.transform || '',
      pageZoom: pageStyle?.getPropertyValue('zoom') || '1',
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      visibleText
    }
  })
  expect(layoutMetrics.layoutClassName).toContain('external-full-page-layout--teacher-test-generation')
  expect(layoutMetrics.layoutBackground).toBe('rgb(245, 242, 234)')
  expect(layoutMetrics.bodyBackground).toBe('rgb(245, 242, 234)')
  expect(layoutMetrics.documentWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 1)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(layoutMetrics.pageTransform)
  const zoom = !layoutMetrics.pageZoom || layoutMetrics.pageZoom === 'normal' ? 1 : Number.parseFloat(layoutMetrics.pageZoom)
  expect(zoom).toBeCloseTo(1)
  expect(layoutMetrics.visibleText).not.toContain('/api/v1')
  expect(layoutMetrics.visibleText).not.toContain('后端未返回')
  expect(layoutMetrics.visibleText).not.toContain('artifact_id')
  expect(layoutMetrics.visibleText).not.toMatch(/mock|fallback|接口错误/i)

  const suffix = Date.now()
  await page.locator('#paperCourseName').fill(`E2E PrismMind 测试 ${suffix}`)
  await page.locator('#paperExamDuration').fill('90分钟')
  await page.locator('#paperTotalScore').fill('100')
  await page.locator('#paperExamScope').fill('学生画像、课程知识库、智能答疑、资源生成质量分析与学习路径推荐。')
  await page.locator('#paperDifficultyRatio').fill('基础30%，中等50%，提高20%')
  await page.locator('#paperQuestionDistribution').fill('单项选择题：20题，每题2分\n填空题：10题，每题2分\n综合题：3题，每题10分\n简答题：2题，每题5分')
  const previewLegend = page.locator('.legend-list')
  await expect(previewLegend).toContainText('单项选择题')
  await expect(previewLegend).toContainText('填空题')
  await expect(previewLegend).toContainText('综合题')
  await expect(previewLegend).toContainText('简答题')
  await expect(previewLegend).not.toContainText('题型3')
  await page.locator('#paperReferenceDescription').fill('围绕 PrismMind 教师端生成闭环、RAG 辅导与学习数据分析进行命题。')
  await page.locator('.reference-file-native-input').setInputFiles([
    {
      name: `test-generation-reference-${suffix}-1.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('PrismMind test generation reference one for E2E.')
    },
    {
      name: `test-generation-reference-${suffix}-2.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('PrismMind test generation reference two for E2E.')
    }
  ])
  await expect(page.locator('.file-state-text')).toContainText('已选择 2/20 个文件')
  await expect(page.locator('.reference-file-list li')).toHaveCount(2)

  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/files/upload') && response.request().method() === 'POST' && response.ok()
  )
  const generateResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/papers/generate') && response.request().method() === 'POST' && response.ok()
  )
  await page.locator('[data-testid="external-teacher-test-generation"] .primary-action').click()
  await expect(page.getByTestId('paper-preparation-progress')).toBeVisible()
  await expect(page.getByTestId('paper-preparation-progress')).toContainText(/上传|解析|生成任务/)
  await uploadResponse
  await generateResponse
  const taskProgress = page.getByTestId('teacher-task-progress')
  await expect(taskProgress).toBeVisible({ timeout: 20_000 })
  await expect(taskProgress.getByRole('progressbar')).toBeVisible()
  await expect(taskProgress).toContainText(/任务|生成|检索|完成/)
  await expect(taskProgress.getByRole('link', { name: '查看生成资源详情' })).toBeVisible({ timeout: 120_000 })

  const historyResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/generated-artifacts') &&
    response.url().includes('artifact_type=paper') &&
    response.request().method() === 'GET' &&
    response.ok()
  )
  await page.getByRole('button', { name: /管理我的试卷/ }).click()
  await historyResponse
  await expect(page.getByTestId('external-teacher-paper-history')).toBeVisible({ timeout: 20_000 })
  await saveScreenshot(page, 'teacher-test-generation')

  await page.evaluate(() => {
    localStorage.setItem('prismmind_extra_probe', '1')
    sessionStorage.setItem('edugenie_extra_probe', '1')
  })
  await page.locator('.top-nav-button', { hasText: '首页' }).click()
  await expect(page).toHaveURL(/\/teacher\/dashboard$/)

  await gotoApp(page, '/teacher/papers')
  await page.locator('.top-nav-button', { hasText: '退出' }).click()
  await expect(page).toHaveURL(/\/auth\/login/)
  const storageAfterLogout = await page.evaluate(() => ({
    accessToken: localStorage.getItem('access_token'),
    prismmindProbe: localStorage.getItem('prismmind_extra_probe'),
    edugenieProbe: sessionStorage.getItem('edugenie_extra_probe')
  }))
  expect(storageAfterLogout).toEqual({ accessToken: null, prismmindProbe: null, edugenieProbe: null })

  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
