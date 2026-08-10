import { expect, test, type Page } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  expectExternalFullPage,
  expectNoPageIssues,
  gotoApp,
  loginViaUI
} from './helpers'

test.beforeEach(async ({ page }) => {
  await loginViaUI(page, accounts.student)
})

test('external student tutoring page uses the real tutoring API without legacy layout or overflow', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1366, height: 768 })

  const issues = collectPageIssues(page)
  const tutoringApiHits: string[] = []
  const forbiddenApiHits: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    const parsedUrl = new URL(url)
    const path = parsedUrl.pathname

    if (path.startsWith('/api/v1/student/tutoring')) {
      tutoringApiHits.push(`${request.method()} ${path}`)
    }

    if (
      path.startsWith('/api/student/tutor') ||
      path.startsWith('/api/student/tutoring') ||
      path.startsWith('/api/tutoring') ||
      path.startsWith('/api/tutor') ||
      path.startsWith('/api/qa') ||
      path.startsWith('/api/chat') ||
      path.startsWith('/api/ask') ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:3000' ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:5000'
    ) {
      forbiddenApiHits.push(url)
    }
  })

  const conversationsResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tutoring/conversations') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/tutoring')

  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-tutoring')).toBeVisible()
  await expect((await conversationsResponse).ok()).toBeTruthy()
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.getByText('智能学习辅导')).toBeVisible()
  await expect(page.locator('.tutor-chat-panel')).toBeVisible()
  await expect(page.locator('.tutor-list-state')).toHaveCount(0, { timeout: 20_000 })

  const staticChromeText = await page
    .locator('.tutor-heading, .tutor-quick-tags, .tutor-answer-mode, .tutor-input-actions, .tutor-assistant-card')
    .allInnerTexts()
  expect(staticChromeText.join('\n')).not.toMatch(/API|接口|mock|fallback|后端暂无|接口未实现|AI Tutor|PrismMind learning assistant|98%|97%|1\.2s/)
  await assertNoTutoringHorizontalOverflow(page)

  await page.getByRole('button', { name: '新建会话' }).click()
  const tutoringInput = page.getByRole('textbox', { name: '输入你的问题' })
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/student/tutoring/conversations') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 60_000 }
  )
  const streamResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/tutoring\/conversations\/\d+\/messages\/stream$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 120_000 }
  )
  const question = `请用标题和列表解释二叉树遍历 ${Date.now()}`
  await tutoringInput.fill(question)
  await tutoringInput.press('Enter')
  const tutoringProgress = page.getByTestId('tutoring-generation-progress')
  await expect(tutoringProgress).toBeVisible()
  await expect(tutoringProgress.getByRole('progressbar')).toBeVisible()
  await expect(tutoringProgress).toContainText(/回答|%/)
  await expect((await createResponse).ok()).toBeTruthy()
  await expect((await streamResponse).ok()).toBeTruthy()
  await expect(page.locator('.tutor-message.is-user').last()).toContainText('二叉树遍历')
  const assistantMessage = page.locator('.tutor-message.is-ai').last()
  await expect(assistantMessage).toBeVisible({ timeout: 20_000 })
  await expect(assistantMessage.locator('.tutor-thinking')).toBeVisible({ timeout: 20_000 })
  await expect(assistantMessage.locator('.tutor-thinking')).toHaveCount(0, { timeout: 120_000 })
  await expect(assistantMessage.locator('.markdown-body')).not.toBeEmpty()
  await expect(assistantMessage).not.toContainText(/^#{1,6}\s/m)
  await assertNoTutoringHorizontalOverflow(page)

  await page.reload()
  await expect(page.getByTestId('external-student-tutoring')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.tutor-message')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.locator('.tutor-empty-chat')).toContainText('新的空白会话')

  const savedConversation = page.locator('.tutor-history-list button').filter({ hasText: question.slice(0, 20) }).first()
  await expect(savedConversation).toBeVisible({ timeout: 30_000 })
  await savedConversation.click()
  await expect(page.locator('.tutor-message.is-user').filter({ hasText: '二叉树遍历' }).last()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.tutor-message.is-ai').last()).not.toBeEmpty()

  await page.getByRole('button', { name: '新建会话' }).click()
  const restoredInput = page.getByRole('textbox', { name: '输入你的问题' })

  const suggestionButtons = page.locator('.tutor-suggestion-card .student-secondary-button')
  await expect(suggestionButtons.first()).toBeVisible({ timeout: 30_000 })
  await suggestionButtons.first().click()
  await expect(restoredInput).not.toHaveValue('')
  await expect(restoredInput).toBeFocused()

  expect(tutoringApiHits.some((hit) => hit === 'GET /api/v1/student/tutoring/conversations')).toBeTruthy()
  expect(tutoringApiHits.some((hit) => hit === 'POST /api/v1/student/tutoring/conversations')).toBeTruthy()
  expect(tutoringApiHits.some((hit) => /POST \/api\/v1\/student\/tutoring\/conversations\/\d+\/messages\/stream/.test(hit))).toBeTruthy()
  expect(forbiddenApiHits, forbiddenApiHits.join('\n')).toEqual([])
  await assertNoTutoringHorizontalOverflow(page)

  await page.getByRole('button', { name: '首页', exact: true }).click()
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await gotoApp(page, '/student/tutoring')
  await expect(page.getByTestId('external-student-tutoring')).toBeVisible()
  await page.getByRole('button', { name: '退出' }).click()
  await page.waitForURL(/\/auth\/login/, { timeout: 20_000 })
  await expect(page.getByTestId('external-login-page')).toBeVisible()

  expectNoPageIssues(issues)
})

async function assertNoTutoringHorizontalOverflow(page: Page) {
  const coverage = await page.evaluate(() => {
    type ScrollNode = {
      tag: string
      id: string
      className: string
      clientWidth: number
      scrollWidth: number
      overflowX: string
    }

    const collectHorizontalScrollContainers = (nodes: ScrollNode[] = []) => {
      document.querySelectorAll('*').forEach((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        if (!visible) return

        if (style.overflowX === 'scroll' || (style.overflowX === 'auto' && element.scrollWidth > element.clientWidth + 1)) {
          nodes.push({
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

    const root = document.querySelector('[data-testid="external-student-tutoring"]') as HTMLElement | null
    const workbench = document.querySelector('.tutor-workbench') as HTMLElement | null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      rootWidth: root?.scrollWidth || 0,
      rootClientWidth: root?.clientWidth || 0,
      workbenchWidth: workbench?.scrollWidth || 0,
      workbenchClientWidth: workbench?.clientWidth || 0,
      rightEdgeTag: rightEdgeElement?.tagName || null,
      horizontalScrollContainers: collectHorizontalScrollContainers()
    }
  })

  expect(coverage.documentWidth).toBeLessThanOrEqual(coverage.viewportWidth + 1)
  expect(coverage.rootWidth).toBeLessThanOrEqual(coverage.rootClientWidth + 1)
  expect(coverage.workbenchWidth).toBeLessThanOrEqual(coverage.workbenchClientWidth + 1)
  expect(['BODY', 'HTML', null]).not.toContain(coverage.rightEdgeTag)
  expect(coverage.horizontalScrollContainers, JSON.stringify(coverage.horizontalScrollContainers, null, 2)).toEqual([])
}
