import { expect, test, type Page, type Route } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

import { collectPageIssues, expectNoPageIssues, gotoApp } from './helpers'

const forbiddenRuntimeTargets = [
  ['/api', 'auth'].join('/'),
  '/api/login',
  '/api/register',
  'localhost:3000',
  'localhost:5000',
  'localhost:8080'
]

function watchForbiddenRequests(page: Page) {
  const hits: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    const type = request.resourceType()
    if (type !== 'fetch' && type !== 'xhr') return

    const isForbidden = forbiddenRuntimeTargets.some((target) => {
      if (!target.startsWith('/')) return url.includes(target)
      try {
        return new URL(url).pathname === target
      } catch {
        return false
      }
    })
    if (isForbidden) hits.push(url)
  })
  return hits
}

async function delayedJson(route: Route, status: number, body: unknown) {
  await new Promise((resolve) => {
    setTimeout(resolve, 750)
  })
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body)
  })
}

async function saveLoadingScreenshot(page: Page, name: string) {
  const dir = path.resolve(process.cwd(), 'test-results', 'screenshots', 'loading-audit')
  await fs.mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false })
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }))
  expect(Math.max(metrics.documentWidth, metrics.bodyWidth)).toBeLessThanOrEqual(metrics.innerWidth + 2)
}

async function expectNoLegacyFallbackText(page: Page) {
  await expect(page.getByText('接口暂未连接')).toHaveCount(0)
  await expect(page.getByText('前端状态已保留')).toHaveCount(0)
  await expect(page.getByText('注册信息已在前端保留')).toHaveCount(0)
}

async function expectLoadingOverlayVisible(page: Page) {
  const overlay = page.getByTestId('auth-loading-transition')
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveClass(/is-active/)
  await expect(page.locator('.loading-core')).toBeVisible()
  await expect(page.locator('.loading-canvas')).toBeVisible()
  await expect(page.locator('.loading-canvas canvas')).toBeVisible()
  await expect(page.locator('.loading-text')).toContainText('Loading')
}

test('login loading overlay is visible during the real /api/v1 auth request and hides after failure', async ({ page }) => {
  const issues = collectPageIssues(page)
  const forbiddenHits = watchForbiddenRequests(page)

  await page.setViewportSize({ width: 1366, height: 768 })
  await page.route('**/api/v1/auth/login', (route) =>
    delayedJson(route, 401, { message: '登录失败，请检查账号或密码。' })
  )

  await gotoApp(page, '/auth/login')
  await expect(page.getByTestId('external-login-page')).toBeVisible()
  await saveLoadingScreenshot(page, 'auth-login-initial-1366')

  await page.getByPlaceholder('输入用户名').fill('loading_audit_user')
  await page.getByPlaceholder('输入密码').fill('WrongPassword123!')
  await page.getByRole('button', { name: '进入平台' }).click()
  await expectLoadingOverlayVisible(page)
  await saveLoadingScreenshot(page, 'auth-login-loading-1366')

  await expect(page.locator('.auth-status')).toContainText(/登录失败|密码/)
  await expect(page.getByTestId('auth-loading-transition')).toHaveClass(/is-hidden/)
  await expectNoLegacyFallbackText(page)
  await expectNoHorizontalOverflow(page)
  expect(forbiddenHits).toEqual([])
  expectNoPageIssues(issues)
})

test('register loading overlay is visible during /api/v1 registration and returns to login cleanly', async ({ page }) => {
  const issues = collectPageIssues(page)
  const forbiddenHits = watchForbiddenRequests(page)
  const suffix = Date.now()

  await page.setViewportSize({ width: 1366, height: 768 })
  await page.route('**/api/v1/auth/register', (route) =>
    delayedJson(route, 200, {
      id: 900001,
      username: `loading_register_${suffix}`,
      email: `loading_register_${suffix}@example.com`,
      full_name: 'Loading 审计账号',
      role: 'student',
      is_active: true
    })
  )

  await gotoApp(page, '/auth/register')
  await expect(page.getByTestId('external-register-page')).toBeVisible()
  await saveLoadingScreenshot(page, 'auth-register-initial-1366')

  await page.locator('#external-register-username').fill(`loading_register_${suffix}`)
  await page.locator('#external-register-email').fill(`loading_register_${suffix}@example.com`)
  await page.locator('#external-register-password').fill('LoadingRegister123!')
  await page.getByRole('button', { name: '完成注册' }).click()
  await expectLoadingOverlayVisible(page)
  await saveLoadingScreenshot(page, 'auth-register-loading-1366')

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectNoLegacyFallbackText(page)
  await expectNoHorizontalOverflow(page)
  expect(forbiddenHits).toEqual([])
  expectNoPageIssues(issues)
})

test('loading overlay remains responsive at 1920px without whole-page scale or overflow', async ({ page }) => {
  const issues = collectPageIssues(page)
  const forbiddenHits = watchForbiddenRequests(page)
  const suffix = Date.now()

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.route('**/api/v1/auth/login', (route) =>
    delayedJson(route, 401, { message: '登录失败，请检查账号或密码。' })
  )

  await gotoApp(page, '/auth/login')
  await page.getByPlaceholder('输入用户名').fill('loading_audit_user')
  await page.getByPlaceholder('输入密码').fill('WrongPassword123!')
  await page.getByRole('button', { name: '进入平台' }).click()
  await expectLoadingOverlayVisible(page)
  await saveLoadingScreenshot(page, 'auth-login-loading-1920')
  await expect(page.getByTestId('auth-loading-transition')).toHaveClass(/is-hidden/)

  await page.unroute('**/api/v1/auth/login')
  await page.route('**/api/v1/auth/register', (route) =>
    delayedJson(route, 200, {
      id: 900002,
      username: `loading_register_wide_${suffix}`,
      email: `loading_register_wide_${suffix}@example.com`,
      role: 'student',
      is_active: true
    })
  )

  await gotoApp(page, '/auth/register')
  await page.locator('#external-register-username').fill(`loading_register_wide_${suffix}`)
  await page.locator('#external-register-email').fill(`loading_register_wide_${suffix}@example.com`)
  await page.locator('#external-register-password').fill('LoadingRegister123!')
  await page.getByRole('button', { name: '完成注册' }).click()
  await expectLoadingOverlayVisible(page)
  await saveLoadingScreenshot(page, 'auth-register-loading-1920')

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectNoLegacyFallbackText(page)
  await expectNoHorizontalOverflow(page)
  expect(forbiddenHits).toEqual([])
  expectNoPageIssues(issues)
})
