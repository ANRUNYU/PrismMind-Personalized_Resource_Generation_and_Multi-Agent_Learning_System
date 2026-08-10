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

test.beforeEach(async ({ page }) => {
  await loginViaUI(page, accounts.student)
})

test('external change student pages keep the core student flow usable', async ({ page }) => {
  const issues = collectPageIssues(page)
  const legacyApiHits: string[] = []
  const dashboardApiHits: string[] = []
  const assessmentApiHits: string[] = []
  const tutoringApiHits: string[] = []
  const testsApiHits: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    const parsedUrl = new URL(url)
    const path = parsedUrl.pathname
    if (path.startsWith('/api/v1/student/tutoring')) {
      tutoringApiHits.push(`${request.method()} ${path}`)
    }
    if (path.startsWith('/api/v1/student/dashboard')) {
      dashboardApiHits.push(`${request.method()} ${path}`)
    }
    if (path.startsWith('/api/v1/student/assessments')) {
      assessmentApiHits.push(`${request.method()} ${path}`)
    }
    if (path.startsWith('/api/v1/student/tests')) {
      testsApiHits.push(`${request.method()} ${path}`)
    }
    if (
      url.startsWith('http://127.0.0.1:8000/api/') &&
      !url.startsWith('http://127.0.0.1:8000/api/v1/')
    ) {
      legacyApiHits.push(url)
    }
    if (
      path.startsWith('/api/resources') ||
      path.startsWith('/api/tests') ||
      path.startsWith('/api/exams') ||
      path.startsWith('/api/quiz') ||
      path.startsWith('/api/my/tests') ||
      path.startsWith('/api/student') ||
      path.startsWith('/api/tutor') ||
      path.startsWith('/api/agent') ||
      path.startsWith('/api/chat') ||
      path.startsWith('/api/study-plan') ||
      path.startsWith('/api/paths') ||
      path.startsWith('/api/learning-paths') ||
      path.startsWith('/api/resource-center') ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:3000' ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:5000'
    ) {
      legacyApiHits.push(url)
    }
  })

  const dashboardSummaryResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/dashboard/summary') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/dashboard')
  await expect(page.getByTestId('external-student-main')).toBeVisible()
  await expectExternalFullPage(page)
  const dashboardViewport = await page.evaluate(() => {
    const rectOf = (element: Element | null) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        position: style.position,
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth,
        overflowX: style.overflowX
      }
    }
    const collectHorizontalScrollContainers = (root: Document | ShadowRoot, label: string, nodes: Array<Record<string, unknown>> = []) => {
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
    const layout = document.querySelector('.external-full-page-layout')
    const host = document.querySelector('[data-testid="external-student-main"]')
    const pageRoot = host?.shadowRoot?.querySelector('.page-root') || null
    const sidebar = host?.shadowRoot?.querySelector('.feature-sidebar') || null
    const canvas = host?.shadowRoot?.querySelector('#app canvas') || null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      bodyBackground: window.getComputedStyle(document.body).backgroundColor,
      rightEdgeTag: rightEdgeElement?.tagName || null,
      layoutRect: rectOf(layout),
      hostRect: rectOf(host),
      pageRootRect: rectOf(pageRoot),
      sidebarRect: rectOf(sidebar),
      canvasRect: rectOf(canvas),
      horizontalScrollContainers: collectHorizontalScrollContainers(document, 'document')
    }
  })
  expect(dashboardViewport.documentWidth).toBeLessThanOrEqual(dashboardViewport.viewportWidth + 1)
  expect(dashboardViewport.bodyWidth).toBeLessThanOrEqual(dashboardViewport.viewportWidth + 1)
  expect(dashboardViewport.bodyBackground).toBe('rgb(0, 0, 0)')
  expect(['BODY', 'HTML', null]).not.toContain(dashboardViewport.rightEdgeTag)
  expect(dashboardViewport.layoutRect?.right).toBeGreaterThanOrEqual(dashboardViewport.viewportWidth - 1)
  expect(dashboardViewport.hostRect?.right).toBeGreaterThanOrEqual(dashboardViewport.viewportWidth - 1)
  expect(dashboardViewport.pageRootRect?.position).toBe('fixed')
  expect(dashboardViewport.sidebarRect?.position).toBe('fixed')
  expect(dashboardViewport.sidebarRect?.scrollWidth).toBeLessThanOrEqual((dashboardViewport.sidebarRect?.clientWidth || 0) + 1)
  expect(dashboardViewport.canvasRect?.right).toBeGreaterThanOrEqual(dashboardViewport.viewportWidth - 1)
  expect(dashboardViewport.horizontalScrollContainers, JSON.stringify(dashboardViewport.horizontalScrollContainers, null, 2)).toEqual([])
  await expect((await dashboardSummaryResponse).ok()).toBeTruthy()
  await expect(page.locator('.student-dashboard-summary-dock')).toBeHidden({ timeout: 20_000 })
  await page.getByRole('button', { name: '用户' }).click()
  await expect(page.locator('#user-popover')).toBeVisible()
  await expect(page.locator('#user-popover')).toContainText(/学习概览已同步|学习概览稍后可用|学习概览同步中|暂无学习概览/)
  await expect(page.getByText('学生学习工作台')).toHaveCount(0)
  await expect(page.getByText('Student profile has not been created')).toHaveCount(0)
  await saveScreenshot(page, 'student-dashboard')

  const coursesResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/courses/my') && response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/courses')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-courses')).toBeVisible()
  await coursesResponse
  await expect(page.getByTestId('external-loading')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByText('正在加载我的课程')).toHaveCount(0)
  await expect(page.getByText('我的课程').first()).toBeVisible()
  await expect(page.locator('.mine-lessons-page .search-box')).toBeVisible()
  await expect(page.locator('.mine-lessons-page .join-code-box')).toBeVisible()
  await expect(page.locator('.mine-lessons-page .stats-panel')).toBeVisible()
  await expect(page.locator('.mine-lessons-page .lesson-detail-panel')).toBeVisible()

  const profileResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/student/profile/me') && response.status() < 500,
    { timeout: 20_000 }
  ).catch(() => null)
  await gotoApp(page, '/student/profile')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-portrait')).toBeVisible()
  await profileResponse
  await expect(page.getByText('画像智能助手', { exact: true })).toBeVisible()
  await expect(page.getByText('画像维度')).toBeVisible()
  await expect(page.getByText('DATA STREAM')).toHaveCount(0)
  await expect(page.getByText(/真实画像数据|请先创建学习画像|画像数据暂不可用/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('六维能力雷达')).toHaveCount(0)
  await saveScreenshot(page, 'student-profile')

  const tutoringSessionsResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tutoring/sessions') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/tutoring')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-tutoring')).toBeVisible()
  await expect((await tutoringSessionsResponse).ok()).toBeTruthy()
  await expect(page.getByText('智能学习辅导')).toBeVisible()
  await expect(page.getByText('正在加载辅导历史...')).toHaveCount(0, { timeout: 20_000 })

  const tutoringInput = page.getByPlaceholder('输入你的问题...')
  const askResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tutoring/ask') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 60_000 }
  )
  await tutoringInput.fill('请解释个性化学习资源如何帮助我复习。')
  await page.getByRole('button', { name: '发送' }).click()
  await expect((await askResponse).ok()).toBeTruthy()
  await expect(page.locator('.tutor-message.is-ai').last()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.tutor-thinking')).toHaveCount(0, { timeout: 60_000 })

  const hintResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tutoring/hint') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 60_000 }
  )
  await page.locator('.tutor-answer-mode button').filter({ hasText: '步骤' }).click()
  await tutoringInput.fill('请只给我下一步思考提示。')
  await page.getByRole('button', { name: '发送' }).click()
  await expect((await hintResponse).ok()).toBeTruthy()

  const explainResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tutoring/explain') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 60_000 }
  )
  await page.locator('.tutor-answer-mode button').filter({ hasText: '图解' }).click()
  await tutoringInput.fill('检索增强生成')
  await page.getByRole('button', { name: '发送' }).click()
  await expect((await explainResponse).ok()).toBeTruthy()
  await expect(page.locator('.tutor-message.is-ai').last()).toBeVisible({ timeout: 60_000 })
  const referenceList = page.locator('.tutor-reference-list')
  if ((await referenceList.count()) > 0) {
    await expect(referenceList.first()).toBeVisible()
  } else {
    await expect(page.getByText('本次回答未返回可展示来源，内容将按通用学习策略呈现。').first()).toBeVisible()
  }
  const tutoringRatingResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tutoring/sessions/') &&
      response.url().endsWith('/rating') &&
      response.request().method() === 'POST',
    { timeout: 20_000 }
  )
  await page.locator('.tutor-message.is-ai').last().getByRole('button', { name: '有帮助' }).click()
  await expect((await tutoringRatingResponse).ok()).toBeTruthy()
  expect(tutoringApiHits.some((hit) => hit === 'POST /api/v1/student/tutoring/ask')).toBeTruthy()
  expect(tutoringApiHits.some((hit) => hit === 'POST /api/v1/student/tutoring/hint')).toBeTruthy()
  expect(tutoringApiHits.some((hit) => hit === 'POST /api/v1/student/tutoring/explain')).toBeTruthy()
  await saveScreenshot(page, 'student-tutoring')

  await page.route(
    '**/api/v1/student/resources**',
    async (route) => {
      await page.waitForTimeout(500)
      await route.continue()
    },
    { times: 1 }
  )
  const resourcesResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/student/resources') && response.request().method() === 'GET' && response.status() < 500,
    { timeout: 20_000 }
  )
  await page.goto('/student/resources', { waitUntil: 'domcontentloaded' })
  await expectExternalFullPage(page)
  await page.getByTestId('external-loading').waitFor({ state: 'attached', timeout: 5_000 }).catch(() => undefined)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await resourcesResponse
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  await expect(page.getByTestId('external-loading')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('external-student-resources')).toBeVisible()
  await expect(page.getByText(/暂无学习资源|已生成资源/).first()).toBeVisible()
  const resourceTopic = `E2E PrismMind 学习资源 ${Date.now()}`
  await page.getByPlaceholder('例如：过拟合与正则化').fill(resourceTopic)
  const generateResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/student/resources/generate') && response.request().method() === 'POST',
    { timeout: 45_000 }
  )
  await page.getByRole('button', { name: '生成资源', exact: true }).click()
  await expect((await generateResponse).ok()).toBeTruthy()
  await expect(page.getByText('最新生成结果')).toBeVisible({ timeout: 45_000 })
  const resourceLibrary = page.locator('.resource-list-panel')
  const resourceRow = resourceLibrary.locator('article.resource-item').filter({ hasText: resourceTopic }).first()
  await expect(resourceRow).toBeVisible({ timeout: 45_000 })
  const detailResponse = page.waitForResponse(
    (response) => /\/api\/v1\/student\/resources\/\d+$/.test(new URL(response.url()).pathname),
    { timeout: 20_000 }
  )
  await resourceRow.getByRole('button', { name: '查看' }).click()
  await expect((await detailResponse).ok()).toBeTruthy()
  const detailDrawer = page.locator('.resource-detail-drawer')
  await expect(detailDrawer).toBeVisible()
  const completeButton = detailDrawer.getByRole('button', { name: '标记完成' })
  if ((await completeButton.count()) > 0 && !(await completeButton.isDisabled())) {
    const completeResponse = page.waitForResponse(
      (response) => response.url().includes('/api/v1/student/resources/') && response.url().endsWith('/complete'),
      { timeout: 20_000 }
    )
    await completeButton.click()
    await expect((await completeResponse).ok()).toBeTruthy()
    await expect(page.getByText('已完成').first()).toBeVisible({ timeout: 20_000 })
  }
  const ratingResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/student/resources/') && response.url().endsWith('/rating'),
    { timeout: 20_000 }
  )
  await detailDrawer.getByRole('button', { name: '详情5星' }).click()
  await expect((await ratingResponse).ok()).toBeTruthy()
  await expect(page.getByText('5 星').first()).toBeVisible({ timeout: 20_000 })
  await saveScreenshot(page, 'student-resources')

  const learningPathListResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/learning-paths') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/learning-paths')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-study-plan')).toBeVisible()
  await expect((await learningPathListResponse).ok()).toBeTruthy()
  await expect(page.locator('.study-loading')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.getByText(/我的学习路径|暂无学习路径/).first()).toBeVisible()

  const pathTitle = `E2E PrismMind 学习路径 ${Date.now()}`
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/student/learning-paths') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 45_000 }
  )
  const pathDetailResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/learning-paths\/\d+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 45_000 }
  )
  await page.getByPlaceholder('输入学习主题').fill(pathTitle)
  await page.getByRole('button', { name: '生成路径' }).click()
  await expect((await createResponse).ok()).toBeTruthy()
  await expect((await pathDetailResponse).ok()).toBeTruthy()
  await expect(page.getByText(pathTitle).first()).toBeVisible({ timeout: 45_000 })
  const createdCard = page.locator('.study-plan-card').filter({ hasText: pathTitle }).first()
  await expect(createdCard).toBeVisible({ timeout: 20_000 })
  await createdCard.click({ force: true })
  await expect(page.locator('.study-detail-panel')).toBeVisible()
  await expect(page.locator('.study-step-block').first()).toBeVisible({ timeout: 20_000 })

  await page.locator('.study-step-title-button').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const completeLearningResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/learning-paths\/\d+\/steps\/\d+\/complete-learning$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 45_000 }
  )
  const quizResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/learning-paths\/\d+\/quiz$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 45_000 }
  )
  const startResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/tests\/\d+\/start$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 45_000 }
  )
  await page.getByRole('button', { name: '完成学习并开始测验' }).click()
  await expect((await completeLearningResponse).ok()).toBeTruthy()
  await expect((await quizResponse).ok()).toBeTruthy()
  await expect((await startResponse).ok()).toBeTruthy()
  await expect(page.getByText('步骤配套练习')).toBeVisible({ timeout: 30_000 })
  await saveScreenshot(page, 'student-learning-paths')

  const testsListResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tests') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/tests')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-tests')).toBeVisible()
  await expect((await testsListResponse).ok()).toBeTruthy()
  await expect(page.getByText(/资源 ID|路径 ID/)).toHaveCount(0)
  const generatedTestTopic = `E2E PrismMind 测验 ${Date.now()}`
  await page.getByPlaceholder(/搜索或输入新测验主题/).fill(generatedTestTopic)
  const testGenerateResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tests/generate') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 45_000 }
  )
  await page.getByRole('button', { name: '生成测验' }).click()
  await expect((await testGenerateResponse).ok()).toBeTruthy()
  await expect(page.getByText('测验详情')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText('提交前隐藏标准答案')).toBeVisible()
  const startButton = page.getByRole('button', { name: '开始测验' })
  await expect(startButton).toBeVisible({ timeout: 20_000 })
  const testStartResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/tests\/\d+\/start$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 30_000 }
  )
  await startButton.click()
  await expect((await testStartResponse).ok()).toBeTruthy()
  await expect(page.getByText(/作答中|测验详情/).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: '提交答案' })).toBeVisible({ timeout: 20_000 })
  const questionCards = page.locator('article.test-question-card').filter({ has: page.locator('h4') })
  const questionCount = await questionCards.count()
  expect(questionCount).toBeGreaterThan(0)
  for (let index = 0; index < questionCount; index += 1) {
    const card = questionCards.nth(index)
    const radios = card.locator('input[type="radio"]:not([disabled])')
    const checkboxes = card.locator('input[type="checkbox"]:not([disabled])')
    const selects = card.locator('select:not([disabled])')
    const textareas = card.locator('textarea:not([disabled])')
    if (await radios.count()) {
      await radios.first().check()
    } else if (await checkboxes.count()) {
      await checkboxes.first().check()
    } else if (await selects.count()) {
      await selects.first().selectOption('true')
    } else if (await textareas.count()) {
      await textareas.first().fill('个性化学习资源可以帮助聚焦薄弱知识点并提供复盘材料。')
    }
  }
  const testSubmitResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/tests\/\d+\/submit$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 30_000 }
  )
  await page.getByRole('button', { name: '提交答案' }).click()
  await expect((await testSubmitResponse).ok()).toBeTruthy()
  await expect(page.getByText('本次测验得分').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('标准答案').first()).toBeVisible()
  await expect(page.getByText('覆盖度').first()).toBeVisible()
  expect(testsApiHits.some((hit) => hit === 'GET /api/v1/student/tests')).toBeTruthy()
  expect(testsApiHits.some((hit) => hit === 'POST /api/v1/student/tests/generate')).toBeTruthy()
  expect(testsApiHits.some((hit) => /POST \/api\/v1\/student\/tests\/\d+\/start/.test(hit))).toBeTruthy()
  expect(testsApiHits.some((hit) => /POST \/api\/v1\/student\/tests\/\d+\/submit/.test(hit))).toBeTruthy()
  await saveScreenshot(page, 'student-tests')

  await gotoApp(page, '/student/assessments')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-assessments')).toBeVisible()
  await expect(page.getByText(/assessment_id|resource_id|path_id|test_id/)).toHaveCount(0)

  // Wait for page structure to render (shell + data sections)
  await expect(page.getByText('学习效果评估').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('AI生成测试').first()).toBeVisible({ timeout: 30_000 })

  // Wait for overview data
  await expect(page.getByTestId('assessment-overview')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.effect-loading')).toHaveCount(0, { timeout: 30_000 })

  // Check for either data or empty state
  const hasData = await page.getByText('评估次数').count() > 0
  const hasEmpty = await page.getByText('暂无汇总').count() > 0
  expect(hasData || hasEmpty).toBe(true)

  // Recommendations section
  await expect(page.getByText('学习建议').first()).toBeVisible({ timeout: 30_000 })

  // Create assessment form
  await expect(page.getByText('创建评估').first()).toBeVisible({ timeout: 30_000 })

  const assessmentTopic = `E2E PrismMind 评估 ${Date.now()}`
  const assessmentCreateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/student/assessments') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 45_000 }
  )
  await page.getByPlaceholder('例如：Python基础、数据结构、机器学习').fill(assessmentTopic)
  await page.locator('.effect-generate-panel button[type="submit"]').first().click()
  const assessmentProgress = page.getByTestId('assessment-generation-progress')
  await expect(assessmentProgress).toBeVisible()
  await expect(assessmentProgress.getByRole('progressbar')).toBeVisible()
  await expect(assessmentProgress).toContainText(/测试|%/)
  await expect((await assessmentCreateResponse).ok()).toBeTruthy()
  await expect(page.getByText(assessmentTopic).first()).toBeVisible({ timeout: 45_000 })

  const assessmentDetailResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/assessments\/\d+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 30_000 }
  )
  await page.locator('.effect-record-card').filter({ hasText: assessmentTopic }).first().click()
  await expect((await assessmentDetailResponse).ok()).toBeTruthy()
  await expect(page.locator('.effect-assessment-modal')).toBeVisible({ timeout: 20_000 })
  await page.locator('.effect-assessment-modal .student-secondary-button', { hasText: '关闭' }).click()

  const assessmentSubmitResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/assessments\/\d+\/submit$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 45_000 }
  )
  await page.getByPlaceholder('写下本次评估后的理解、疑问或复盘结论').fill('E2E 提交学习评估反馈，确认真实后端保存。')
  await page.getByPlaceholder('0-100').fill('86')
  await page.getByPlaceholder('对评估结果的补充反馈').fill('需要继续复盘薄弱主题。')
  await page.getByRole('button', { name: '提交评估反馈' }).click()
  await expect((await assessmentSubmitResponse).ok()).toBeTruthy()
  await expect(page.getByText(/评估已提交|结果：/).first()).toBeVisible({ timeout: 30_000 })
  expect(dashboardApiHits.some((hit) => hit === 'GET /api/v1/student/dashboard/summary')).toBeTruthy()
  expect(assessmentApiHits.some((hit) => hit === 'GET /api/v1/student/assessments')).toBeTruthy()
  expect(assessmentApiHits.some((hit) => /GET \/api\/v1\/student\/assessments\/\d+/.test(hit))).toBeTruthy()
  expect(assessmentApiHits.some((hit) => /POST \/api\/v1\/student\/assessments\/\d+\/submit/.test(hit))).toBeTruthy()

  expect(legacyApiHits, legacyApiHits.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
