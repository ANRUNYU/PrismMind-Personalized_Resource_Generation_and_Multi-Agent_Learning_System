import { expect, test, type Page } from '@playwright/test'

import { accounts, collectPageIssues, expectExternalFullPage, expectNoPageIssues, gotoApp, loginViaUI } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await loginViaUI(page, accounts.student)
})

test('student study plan page uses study_plan template and real learning path APIs', async ({ page }) => {
  test.setTimeout(360_000)
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []
  const learningPathRequests: string[] = []

  page.on('request', (request) => {
    const parsed = new URL(request.url())
    const path = parsed.pathname
    if (path.startsWith('/api/v1/student/learning-paths')) {
      learningPathRequests.push(`${request.method()} ${path}`)
    }
    if (
      path.startsWith('/api/study-plan') ||
      path.startsWith('/api/study-plans') ||
      path.startsWith('/api/paths') ||
      path.startsWith('/api/learning-paths') ||
      path.startsWith('/api/student/study-plan') ||
      path.startsWith('/api/student/learning-paths') ||
      path.startsWith('/api/user') ||
      path.startsWith('/api/me') ||
      `${parsed.hostname}:${parsed.port}` === 'localhost:3000' ||
      `${parsed.hostname}:${parsed.port}` === 'localhost:5000' ||
      `${parsed.hostname}:${parsed.port}` === 'localhost:8080'
    ) {
      forbiddenRequests.push(request.url())
    }
  })

  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/learning-paths') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/learning-paths')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-study-plan')).toBeVisible()
  await expect(page.locator('.study-plan-page .study-workbench')).toBeVisible()
  await expect(page.locator('.study-plan-page .study-left-column')).toBeVisible()
  await expect(page.locator('.study-plan-page .study-center-column')).toBeVisible()
  await expect(page.locator('.study-plan-page .study-right-column')).toBeVisible()
  await expect((await listResponse).ok()).toBeTruthy()
  await expect(page.locator('.study-loading')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByText(/Connected to|Using local|接口|mock|fallback|后端暂无|后端未|API|本地演示|演示数据/)).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await assertNoStudyPlanHorizontalOverflow(page)

  const pathTopic = `E2E PrismMind 学习路径 ${Date.now()}`
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/student/learning-paths') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 180_000 }
  )
  const detailResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/learning-paths\/\d+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 180_000 }
  )
  await page.getByPlaceholder('输入学习主题').fill(pathTopic)
  await page.getByRole('button', { name: '生成路径' }).click()
  const generationProgress = page.getByTestId('study-plan-generation-progress')
  await expect(generationProgress).toBeVisible()
  await expect(generationProgress.getByRole('progressbar')).toBeVisible()
  await expect(generationProgress).toContainText(/规划|生成|%/)
  await expect((await createResponse).ok()).toBeTruthy()
  await expect((await detailResponse).ok()).toBeTruthy()
  await expect(page.getByText(pathTopic).first()).toBeVisible({ timeout: 180_000 })

  const createdCard = page.locator('.study-plan-card').filter({ hasText: pathTopic }).first()
  await expect(createdCard).toBeVisible({ timeout: 30_000 })
  await createdCard.click({ force: true })
  await expect(page.locator('.study-detail-panel')).toBeVisible()
  await expect(page.locator('.study-step-list')).toBeVisible()
  await expect(page.locator('.study-step-block').first()).toBeVisible({ timeout: 30_000 })

  const stepTitleButtons = page.locator('.study-step-title-button')
  await expect(stepTitleButtons).toHaveCount(await page.locator('.study-step-block').count())
  await stepTitleButtons.nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.study-step-locked-notice')).toBeVisible()
  await expect(page.getByRole('dialog').locator('.study-step-learning-content')).toHaveCount(0)
  await page.getByRole('button', { name: '关闭章节学习' }).click()

  await stepTitleButtons.first().click()
  await expect(page.getByRole('dialog')).toBeVisible()

  const completeLearningResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/learning-paths\/\d+\/steps\/\d+\/complete-learning$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 60_000 }
  )
  const quizResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/learning-paths\/\d+\/quiz$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 180_000 }
  )
  const startResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/tests\/\d+\/start$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 180_000 }
  )
  await page.getByRole('button', { name: '完成学习并开始测验' }).click()
  await expect((await completeLearningResponse).ok()).toBeTruthy()
  await expect((await quizResponse).ok()).toBeTruthy()
  await expect((await startResponse).ok()).toBeTruthy()
  await expect(page.getByText('步骤配套练习')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('dialog').locator('.study-exercise-panel')).toBeVisible()
  await expect(page.locator('.study-right-column .study-exercise-panel')).toHaveCount(0)

  const questionGroups = page.locator('.study-exercise-panel details')
  for (let index = 0; index < await questionGroups.count(); index += 1) {
    const group = questionGroups.nth(index)
    if (!(await group.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await group.locator('summary').click()
    }
    const radio = group.locator('input[type="radio"]').first()
    if (await radio.count()) await radio.check()
    const textarea = group.locator('textarea')
    if (await textarea.count()) await textarea.fill('结合本章知识点说明概念、原理和应用示例。')
  }
  const submitResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/tests\/\d+\/submit$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 180_000 }
  )
  await page.getByRole('button', { name: '提交测验' }).click()
  await expect((await submitResponse).ok()).toBeTruthy()
  const scoreLabel = page.getByText(/本次测验得分/)
  await expect(scoreLabel).toBeVisible({ timeout: 20_000 })
  const score = Number((await scoreLabel.innerText()).match(/\d+(?:\.\d+)?/)?.[0] || 0)
  await page.getByRole('button', { name: '关闭章节学习' }).click()
  await stepTitleButtons.nth(1).click()
  if (score < 60) {
    await expect(page.locator('.study-step-locked-notice')).toBeVisible()
  } else {
    await expect(page.getByRole('dialog').locator('.study-step-learning-content')).toBeVisible()
  }

  await assertNoStudyPlanHorizontalOverflow(page)
  expect(learningPathRequests.some((hit) => hit === 'GET /api/v1/student/learning-paths')).toBeTruthy()
  expect(learningPathRequests.some((hit) => hit === 'POST /api/v1/student/learning-paths')).toBeTruthy()
  expect(learningPathRequests.some((hit) => /POST \/api\/v1\/student\/learning-paths\/\d+\/steps\/\d+\/complete-learning/.test(hit))).toBeTruthy()
  expect(learningPathRequests.some((hit) => /POST \/api\/v1\/student\/learning-paths\/\d+\/quiz/.test(hit))).toBeTruthy()
  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})

async function assertNoStudyPlanHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="external-student-study-plan"]') as HTMLElement | null
    const workbench = document.querySelector('.study-workbench') as HTMLElement | null
    const style = root ? window.getComputedStyle(root) : null
    const rightEdge = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))
    const horizontalScrollContainers: Array<{ tag: string; className: string; clientWidth: number; scrollWidth: number }> = []

    document.querySelectorAll('*').forEach((element) => {
      const elementStyle = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const visible = rect.width > 0 && rect.height > 0 && elementStyle.visibility !== 'hidden' && elementStyle.display !== 'none'
      if (!visible) return
      if (elementStyle.overflowX === 'scroll' || (elementStyle.overflowX === 'auto' && element.scrollWidth > element.clientWidth + 1)) {
        horizontalScrollContainers.push({
          tag: element.tagName,
          className: String(element.className || ''),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth
        })
      }
    })

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      rootWidth: root?.scrollWidth || 0,
      rootClientWidth: root?.clientWidth || 0,
      workbenchRight: workbench?.getBoundingClientRect().right || 0,
      transform: style?.transform || 'none',
      zoom: style?.getPropertyValue('zoom') || '1',
      rightEdgeTag: rightEdge?.tagName || null,
      horizontalScrollContainers
    }
  })

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.rootWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 1)
  expect(metrics.workbenchRight).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(metrics.transform)
  const zoom = !metrics.zoom || metrics.zoom === 'normal' ? 1 : Number.parseFloat(metrics.zoom)
  expect(zoom).toBeCloseTo(1)
  expect(['BODY', 'HTML', null]).not.toContain(metrics.rightEdgeTag)
  expect(metrics.horizontalScrollContainers, JSON.stringify(metrics.horizontalScrollContainers, null, 2)).toEqual([])
}
