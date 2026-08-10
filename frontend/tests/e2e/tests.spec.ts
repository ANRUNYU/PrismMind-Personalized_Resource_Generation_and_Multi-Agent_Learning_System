import { expect, test } from '@playwright/test'

import { accounts, collectPageIssues, expectExternalFullPage, expectNoPageIssues, gotoApp, loginViaUI, saveScreenshot } from './helpers'

test('student external my_tests page uses the list layout and real /api/v1 lifecycle', async ({ page }) => {
  test.setTimeout(300_000)
  const issues = collectPageIssues(page)
  const legacyApiHits: string[] = []
  const testsApiHits: string[] = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    const path = url.pathname
    if (path.startsWith('/api/v1/student/tests')) testsApiHits.push(`${request.method()} ${path}`)
    if (
      path.startsWith('/api/tests') ||
      path.startsWith('/api/my/tests') ||
      path.startsWith('/api/exams') ||
      path.startsWith('/api/quiz') ||
      (request.url().startsWith('http://127.0.0.1:8000/api/') && !request.url().startsWith('http://127.0.0.1:8000/api/v1/'))
    ) {
      legacyApiHits.push(request.url())
    }
  })

  await loginViaUI(page, accounts.student)

  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tests') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/tests')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-tests')).toBeVisible()
  await expect((await listResponse).ok()).toBeTruthy()

  const topNav = page.locator('.tests-page .top-nav')
  await expect(topNav).toHaveCount(1)
  await expect(topNav.locator('.top-brand-name strong')).toHaveText('棱镜智教')
  await expect(topNav.locator('.top-brand-name em')).toHaveText('PrismMind')
  await expect(topNav.locator('.top-nav-left .top-nav-button')).toHaveCount(2)
  await expect(topNav.locator('.top-nav-right .top-nav-button')).toHaveCount(2)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)

  await expect(page.getByRole('heading', { name: '我的测验' })).toBeVisible()
  await expect(page.getByText('My Tests')).toBeVisible()
  await expect(page.getByTestId('student-tests-hero')).toBeVisible()
  await expect(page.getByTestId('student-tests-stats')).toBeVisible()
  await expect(page.locator('.test-detail-panel')).toBeVisible()

  const filterTabs = page.getByTestId('student-test-filter-tabs')
  await expect(filterTabs).toBeVisible()
  await expect(filterTabs.locator('button')).toHaveCount(5)
  await expect(page.getByTestId('test-filter-all')).toContainText('全部测验')
  await expect(page.getByTestId('test-filter-generated')).toContainText('待开始')
  await expect(page.getByTestId('test-filter-in_progress')).toContainText('作答中')
  await expect(page.getByTestId('test-filter-submitted')).toContainText('已提交')
  await expect(page.getByTestId('test-filter-records')).toContainText('总记录')
  await expect(page.locator('.test-filter-rail')).toHaveCount(0)
  await expect(page.locator('.test-card-system')).toHaveCount(0)
  await expect(page.locator('.test-scene-layer')).toHaveCount(0)

  const list = page.getByTestId('student-tests-list')
  const listItems = page.getByTestId('student-test-list-item')
  await expect(list).toBeVisible()
  await expect(listItems.first()).toBeVisible({ timeout: 20_000 })
  const initialCount = await listItems.count()
  expect(initialCount).toBeGreaterThan(0)

  const selectionTarget = initialCount > 1 ? listItems.nth(1) : listItems.first()
  const selectionTitle = await selectionTarget.locator('h3').innerText()
  await selectionTarget.click()
  await expect(selectionTarget).toHaveClass(/is-selected/)
  await expect(page.locator('.test-detail-panel h2')).toHaveText(selectionTitle, { timeout: 20_000 })

  const evidencePanel = page.getByTestId('test-evidence-panel')
  const evidenceList = page.getByTestId('test-evidence-file-list')
  const evidenceRefresh = page.getByTestId('test-evidence-refresh')
  const evidenceUpload = page.getByTestId('test-evidence-upload')
  await expect(evidencePanel).toBeVisible()
  await expect(evidenceList).toBeVisible()
  await expect(evidenceUpload).toBeVisible()
  await expect(evidenceRefresh).toBeEnabled({ timeout: 20_000 })
  await evidenceRefresh.click()
  await expect(evidenceRefresh).toBeEnabled({ timeout: 20_000 })

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) return null
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        left: Math.round(box.left),
        width: Math.round(box.width),
        height: Math.round(box.height),
        display: style.display,
        columns: style.gridTemplateColumns,
        maxHeight: style.maxHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY
      }
    }
    return {
      page: rect('.tests-page'),
      grid: rect('.student-tests-layout'),
      hero: rect('.tests-hero-card'),
      evidence: rect('.test-evidence-scroll'),
      filters: rect('.tests-filter-tabs'),
      list: rect('.tests-list'),
      item: rect('.tests-list-item'),
      stats: rect('.tests-stats-card'),
      detail: rect('.test-detail-panel'),
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth
    }
  })
  expect(layout.grid?.columns.split(' ').length).toBe(2)
  expect(layout.filters?.columns.split(' ').length).toBe(5)
  expect(layout.evidence?.maxHeight).toBe('120px')
  expect(layout.evidence?.overflowY).toBe('auto')
  expect(layout.list?.overflowY).toBe('auto')
  expect(layout.item?.height).toBeGreaterThanOrEqual(140)
  expect(layout.detail?.overflowY).toBe('auto')
  expect(layout.detail?.width).toBeLessThanOrEqual(442)
  expect(layout.stats?.top).toBe(layout.hero?.top)
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1)

  const evidenceSuffix = Date.now()
  await evidenceUpload.click()
  const uploadDialog = page.getByRole('dialog', { name: '上传知识资料' })
  await expect(uploadDialog).toBeVisible()
  await uploadDialog.locator('.upload-panel input[type="file"]').setInputFiles({
    name: `student-evidence-${evidenceSuffix}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('PrismMind evidence: the network integration acceptance port is 4317. '.repeat(18))
  })
  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/files/upload-batch') && response.request().method() === 'POST'
  )
  await uploadDialog.getByRole('button', { name: /上传 1 个文件/ }).click()
  await expect((await uploadResponse).ok()).toBeTruthy()
  await expect(page.getByText('解析：已解析').first()).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('入库：已入库').first()).toBeVisible({ timeout: 120_000 })
  await page.keyboard.press('Escape')
  await expect(uploadDialog).toBeHidden()

  const topic = `E2E PrismMind 测验 ${Date.now()}`
  await page.getByPlaceholder(/搜索或输入新测验主题/).fill(topic)
  const generateResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tests/generate') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 180_000 }
  )
  await page.getByRole('button', { name: '生成测验' }).click()
  const generationProgress = page.getByTestId('student-test-generation-progress')
  await expect(generationProgress).toBeVisible()
  await expect(generationProgress.getByRole('progressbar')).toBeVisible()
  await expect(generationProgress).toContainText(/测验|%/)
  const generatedResponse = await generateResponse
  await expect(generatedResponse.ok()).toBeTruthy()
  const generateRequest = generatedResponse.request().postDataJSON() as { knowledge_document_ids?: number[] }
  expect(generateRequest.knowledge_document_ids?.length).toBeGreaterThan(0)

  const generatedItem = page.getByTestId('student-test-list-item').filter({ hasText: topic }).first()
  await expect(generatedItem).toBeVisible({ timeout: 180_000 })

  const generatedFilter = page.getByTestId('test-filter-generated')
  await generatedFilter.click()
  await expect(generatedFilter).toHaveClass(/is-active/)
  await expect(generatedItem).toBeVisible()
  const generatedStatuses = await page.getByTestId('student-test-list-item').evaluateAll((items) =>
    items.map((item) => item.getAttribute('data-status'))
  )
  expect(generatedStatuses.length).toBeGreaterThan(0)
  expect(generatedStatuses.every((status) => status === 'generated')).toBeTruthy()

  await page.getByTestId('test-filter-all').click()
  await generatedItem.click()
  await expect(generatedItem).toHaveClass(/is-selected/)
  await expect(page.locator('.test-detail-panel h2')).toHaveText(topic, { timeout: 20_000 })

  const startButton = page.getByRole('button', { name: '开始测验' })
  await expect(startButton).toBeVisible({ timeout: 20_000 })
  const startResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/tests\/\d+\/start$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 30_000 }
  )
  await startButton.click()
  await expect((await startResponse).ok()).toBeTruthy()
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
    if (await radios.count()) await radios.first().check()
    else if (await checkboxes.count()) await checkboxes.first().check()
    else if (await selects.count()) await selects.first().selectOption('true')
    else if (await textareas.count()) await textareas.first().fill('棱镜智教-PrismMind 个性化学习测验作答。')
  }

  const submitResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/tests\/\d+\/submit$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 30_000 }
  )
  await page.getByRole('button', { name: '提交答案' }).click()
  await expect((await submitResponse).ok()).toBeTruthy()
  await expect(page.getByText('本次测验得分').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('标准答案').first()).toBeVisible()
  await expect(page.getByTestId('student-test-quality-v2')).toBeVisible()

  const detailScroll = await page.locator('.detail-panel').evaluate((element) => {
    const panel = element as HTMLElement
    panel.scrollTop = 0
    panel.scrollTo(0, Math.min(160, Math.max(0, panel.scrollHeight - panel.clientHeight)))
    return {
      scrollTop: panel.scrollTop,
      scrollHeight: panel.scrollHeight,
      clientHeight: panel.clientHeight,
      scrollWidth: panel.scrollWidth,
      clientWidth: panel.clientWidth,
      overflowX: window.getComputedStyle(panel).overflowX
    }
  })
  expect(detailScroll.scrollHeight).toBeGreaterThan(detailScroll.clientHeight)
  expect(detailScroll.scrollWidth).toBeLessThanOrEqual(detailScroll.clientWidth + 1)
  expect(['hidden', 'clip', 'auto']).toContain(detailScroll.overflowX)

  expect(testsApiHits.some((hit) => hit === 'GET /api/v1/student/tests')).toBeTruthy()
  expect(testsApiHits.some((hit) => hit === 'POST /api/v1/student/tests/generate')).toBeTruthy()
  expect(testsApiHits.some((hit) => /POST \/api\/v1\/student\/tests\/\d+\/start/.test(hit))).toBeTruthy()
  expect(testsApiHits.some((hit) => /POST \/api\/v1\/student\/tests\/\d+\/submit/.test(hit))).toBeTruthy()
  expect(legacyApiHits, legacyApiHits.join('\n')).toEqual([])

  await saveScreenshot(page, 'student-tests')
  expectNoPageIssues(issues)
})
