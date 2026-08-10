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

test('student portrait page uses portrait_construction with real profile APIs', async ({ page }) => {
  test.setTimeout(240_000)
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []
  const profileApiHits: string[] = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    const path = url.pathname

    if (path.startsWith('/api/v1/student/profile')) {
      profileApiHits.push(`${request.method()} ${path}`)
    }

    if (
      path.startsWith('/api/radar') ||
      path.startsWith('/api/agent') ||
      path.startsWith('/api/student/portrait') ||
      `${url.hostname}:${url.port}` === 'localhost:3000' ||
      `${url.hostname}:${url.port}` === 'localhost:5000' ||
      `${url.hostname}:${url.port}` === 'localhost:8080'
    ) {
      forbiddenRequests.push(request.url())
    }
  })

  const profileResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/profile/me') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )

  await gotoApp(page, '/student/profile')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-portrait')).toBeVisible()
  await expect(page.getByTestId('external-student-profile')).toHaveCount(0)
  await expect((await profileResponse).status()).toBeLessThan(500)

  await expect(page.locator('.radar-profile-page')).toBeVisible()
  await expect(page.locator('.dynamic-radar-shell')).toBeVisible()
  await expect(page.locator('.chat-panel')).toBeVisible()
  await expect(page.locator('.chat-panel-input')).toBeEnabled()
  await expect(page.locator('.radar-data-panel')).toBeVisible()
  await expect(page.getByText('画像智能助手', { exact: true })).toBeVisible()
  await expect(page.getByText('画像维度')).toBeVisible()
  await expect(page.getByText(/真实画像数据|请先创建学习画像|画像数据暂不可用/)).toBeVisible({ timeout: 20_000 })

  await expect(page.getByText(/API|接口|后端暂|mock|fallback|placeholder/i)).toHaveCount(0)
  await expect(page.getByText('六维能力雷达')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)

  const layoutMetrics = await page.evaluate(() => {
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

    const host = document.querySelector('[data-testid="external-student-portrait"]') as HTMLElement | null
    const hostStyle = host ? window.getComputedStyle(host) : null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyWidth: document.body.scrollWidth,
      hasShadowRoot: Boolean(host?.shadowRoot),
      hostClientWidth: host?.clientWidth || 0,
      hostScrollWidth: host?.scrollWidth || 0,
      hostTransform: hostStyle?.transform || '',
      hostZoom: hostStyle?.getPropertyValue('zoom') || '1',
      rightEdgeTag: rightEdgeElement?.tagName || null,
      horizontalScrollContainers: collectHorizontalScrollContainers(document, 'document')
    }
  })

  expect(layoutMetrics.hasShadowRoot).toBeTruthy()
  expect(layoutMetrics.documentWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 1)
  expect(layoutMetrics.bodyWidth).toBeLessThanOrEqual(layoutMetrics.viewportWidth + 1)
  expect(layoutMetrics.hostScrollWidth).toBeLessThanOrEqual(layoutMetrics.hostClientWidth + 1)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(layoutMetrics.hostTransform)
  const zoom = !layoutMetrics.hostZoom || layoutMetrics.hostZoom === 'normal' ? 1 : Number.parseFloat(layoutMetrics.hostZoom)
  expect(zoom).toBeCloseTo(1)
  expect(['BODY', 'HTML', null]).not.toContain(layoutMetrics.rightEdgeTag)
  expect(layoutMetrics.horizontalScrollContainers, JSON.stringify(layoutMetrics.horizontalScrollContainers, null, 2)).toEqual([])

  const conversationRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/api/v1/student/profile/onboarding/messages/stream') &&
      request.method() === 'POST',
    { timeout: 20_000 }
  )
  const conversationResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/profile/onboarding/messages/stream') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 30_000 }
  )
  await page.getByPlaceholder('询问我的学习画像').fill('我是计算机专业大三学生，目标是提升机器学习项目实践能力，每周学习 8 小时。')
  await page.getByRole('button', { name: '发送' }).click()
  const portraitProgress = page.getByTestId('portrait-generation-progress')
  await expect(portraitProgress).toBeVisible()
  await expect(portraitProgress.getByRole('progressbar')).toBeVisible()
  await expect(portraitProgress).toContainText(/画像|%/)
  const requestPayload = (await conversationRequest).postDataJSON()
  expect(requestPayload).toMatchObject({
    answer: expect.stringContaining('计算机'),
    conversation_id: expect.any(Number),
    idempotency_key: expect.any(String)
  })
  await expect((await conversationResponse).ok()).toBeTruthy()
  await expect(page.locator('.chat-message-assistant').last()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.chat-message-assistant:not(.chat-message-typing) .chat-message-markdown').last()).not.toBeEmpty({ timeout: 120_000 })
  await expect(page.locator('.chat-panel-input')).toBeEnabled({ timeout: 150_000 })
  await saveScreenshot(page, 'student-portrait')

  await page.getByRole('button', { name: '首页' }).click()
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await gotoApp(page, '/student/profile')
  await expect(page.getByTestId('external-student-portrait')).toBeVisible()

  await page.evaluate(() => {
    localStorage.setItem('access_token', 'portrait-access')
    localStorage.setItem('refresh_token', 'portrait-refresh')
    localStorage.setItem('prismmind_probe', 'portrait-prism')
    localStorage.setItem('edugenie_probe', 'portrait-edu')
    sessionStorage.setItem('prismmind_probe', 'portrait-session')
  })
  await page.getByRole('button', { name: '退出' }).click()
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

  expect(profileApiHits.some((hit) => hit === 'GET /api/v1/student/profile/me')).toBeTruthy()
  expect(profileApiHits.some((hit) => hit === 'POST /api/v1/student/profile/onboarding/messages/stream')).toBeTruthy()
  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
