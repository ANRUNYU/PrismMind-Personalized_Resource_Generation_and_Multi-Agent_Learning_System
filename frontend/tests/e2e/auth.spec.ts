import { expect, test, type Page } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  ensureAdmin,
  expectExternalFullPage,
  expectNoPageIssues,
  gotoAuthLoading,
  gotoApp,
  loginViaUI,
  logoutViaUI,
  saveScreenshot
} from './helpers'

function watchAuthRuntime(page: Page) {
  const loginHits: string[] = []
  const registerHits: string[] = []
  const meHits: string[] = []
  const refreshHits: string[] = []
  const forbiddenHits: string[] = []
  const legacyAuthPath = ['/api', 'auth'].join('/')

  page.on('request', (request) => {
    const url = request.url()
    const type = request.resourceType()
    if (type !== 'fetch' && type !== 'xhr') return
    if (url.includes('/api/v1/auth/login') && request.method().toUpperCase() === 'POST') {
      loginHits.push(url)
    }
    if (url.includes('/api/v1/auth/register') && request.method().toUpperCase() === 'POST') {
      registerHits.push(url)
    }
    if (url.includes('/api/v1/auth/me') && request.method().toUpperCase() === 'GET') {
      meHits.push(url)
    }
    if (url.includes('/api/v1/auth/refresh') && request.method().toUpperCase() === 'POST') {
      refreshHits.push(url)
    }
    if (
      url.includes(`${legacyAuthPath}/login`) ||
      url.includes(`${legacyAuthPath}/register`) ||
      url.includes(`${legacyAuthPath}/me`) ||
      url.includes(`${legacyAuthPath}/refresh`)
    ) {
      forbiddenHits.push(url)
    }
  })

  return { loginHits, registerHits, meHits, refreshHits, forbiddenHits }
}

test.beforeAll(async ({ request }) => {
  await ensureAdmin(request)
})

test('external React login page, wrong password, and protected-route redirect are clear', async ({ page }) => {
  const issues = collectPageIssues(page)
  const runtime = watchAuthRuntime(page)

  await gotoApp(page, '/auth/login')
  await expect(page).toHaveTitle('棱镜智教-PrismMind')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-login-page')).toBeVisible()
  await expect(page.getByTestId('external-login-panel')).toBeVisible()
  await expect(page.locator('.hero-content')).toContainText('让备课、练习与学习反馈更清晰')
  await expect(page.locator('.lens-background canvas')).toBeVisible()
  await expect(page.locator('.auth-panel-shell')).toBeVisible()
  const studentRole = page.locator('input[name="role"][value="student"]')
  const teacherRole = page.locator('input[name="role"][value="teacher"]')
  await expect(studentRole).toBeChecked()
  await page.locator('.role-option').filter({ hasText: '教师' }).click()
  await expect(teacherRole).toBeChecked()
  await expect(studentRole).not.toBeChecked()
  await expect(page.locator('.el-form')).toHaveCount(0)
  await expect(page.locator('.auth-layout, .change-shell, .main-layout__aside, .main-layout__header')).toHaveCount(0)
  await expect(page.getByText(/接口未实现|后端暂无能力|接口暂未连接|mock|fallback|\/api\/auth\/login/i)).toHaveCount(0)
  await saveScreenshot(page, 'login-page')

  await page.getByRole('button', { name: '创建账号' }).click()
  await expect(page).toHaveURL(/\/auth\/register$/)
  await gotoApp(page, '/auth/login')

  await page.locator('.role-option').filter({ hasText: '教师' }).click()
  await page.getByPlaceholder('输入用户名').fill(accounts.teacher.username)
  await page.getByPlaceholder('输入密码').fill('WrongPassword123!')
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/login') &&
      response.request().method().toUpperCase() === 'POST'
  )
  await page.getByRole('button', { name: '进入平台' }).click()
  const wrongPasswordResponse = await loginResponse
  expect(wrongPasswordResponse.request().postDataJSON()).toMatchObject({ role: 'teacher' })
  await expect(page.locator('.auth-status')).toContainText(/账号或密码不正确|用户名和密码|登录失败/)

  await gotoApp(page, '/teacher/dashboard')
  await expect(page).toHaveURL(/\/auth\/login\?redirect=/)
  expect(runtime.loginHits.length).toBeGreaterThan(0)
  expect(runtime.forbiddenHits).toEqual([])
  expectNoPageIssues(issues)
})

test('external React register page calls the real backend form', async ({ page }) => {
  const issues = collectPageIssues(page)
  const runtime = watchAuthRuntime(page)
  const suffix = Date.now()

  await gotoApp(page, '/auth/register')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-register-page')).toBeVisible()
  await expect(page.getByTestId('external-register-panel')).toBeVisible()
  await expect(page.getByRole('heading', { name: /建立你的.*教学\/学习空间/ })).toBeVisible()
  await expect(page.locator('.register-layout')).toBeVisible()
  await expect(page.locator('.el-form')).toHaveCount(0)
  await expect(page.locator('.auth-layout, .change-shell, .main-layout__aside, .main-layout__header')).toHaveCount(0)
  await expect(page.getByText(/接口未实现|后端暂无能力|接口暂未连接|mock|fallback|\/api\/auth\/register/i)).toHaveCount(0)

  await page.locator('#external-register-username').fill(`audit_register_${suffix}`)
  await page.locator('#external-register-email').fill(`audit_register_${suffix}@example.com`)
  await page.locator('#external-register-password').fill('AuditRegister123!')
  await page.locator('.role-option').filter({ hasText: '教师' }).click()
  const registerResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/register') &&
      response.request().method().toUpperCase() === 'POST'
  )
  await page.getByRole('button', { name: '完成注册' }).click()
  await registerResponse
  await expect(page.getByText('注册成功')).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login$/)

  expect(runtime.registerHits.length).toBeGreaterThan(0)
  expect(runtime.forbiddenHits).toEqual([])
  expectNoPageIssues(issues)
})

test('teacher, student, and admin can sign in and out through the external login island', async ({ page }) => {
  const issues = collectPageIssues(page)
  const runtime = watchAuthRuntime(page)

  await loginViaUI(page, accounts.teacher)
  await expectExternalFullPage(page)
  await expect(page).toHaveURL(accounts.teacher.home)
  await expectStoredSession(page, 'teacher')
  await logoutViaUI(page)

  await loginViaUI(page, accounts.student)
  await expectExternalFullPage(page)
  await expect(page).toHaveURL(accounts.student.home)
  await expectStoredSession(page, 'student')
  await logoutViaUI(page)

  await loginViaUI(page, accounts.admin)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-admin-dashboard')).toBeVisible()
  await expect(page.getByRole('heading', { name: '系统运行概览' })).toBeVisible()
  await expectStoredSession(page, 'admin')
  await logoutViaUI(page)

  expect(runtime.loginHits.length).toBeGreaterThanOrEqual(3)
  expect(runtime.forbiddenHits).toEqual([])
  expectNoPageIssues(issues)
})

test('external loading page verifies real session and routes by role', async ({ page }) => {
  const issues = collectPageIssues(page)
  const runtime = watchAuthRuntime(page)

  await gotoAuthLoading(page)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-loading-page')).toBeVisible()
  await expect(page.getByTestId('external-loading-visual')).toBeVisible()
  await expect(page.locator('.loading-canvas canvas')).toBeVisible()
  await expect(page.getByText(/接口未实现|后端暂无能力|接口暂未连接|mock|fallback|\/api\/auth\/me/i)).toHaveCount(0)
  await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/, { timeout: 10_000 })

  await page.evaluate(() => {
    window.localStorage.setItem('edugenie_access_token', 'expired-loading-token')
  })
  const expiredMeResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/me') &&
      response.request().method().toUpperCase() === 'GET'
  )
  await gotoAuthLoading(page)
  await expect(page.getByTestId('external-loading-page')).toBeVisible()
  await expiredMeResponse
  await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/, { timeout: 10_000 })
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('edugenie_access_token'))).toBeNull()

  await loginViaUI(page, accounts.student)
  const studentMeResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/me') &&
      response.request().method().toUpperCase() === 'GET'
  )
  await gotoAuthLoading(page)
  await expect(page.getByTestId('external-loading-page')).toBeVisible()
  await studentMeResponse
  await expect(page).toHaveURL(accounts.student.home, { timeout: 10_000 })

  await loginViaUI(page, accounts.teacher)
  const teacherMeResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/me') &&
      response.request().method().toUpperCase() === 'GET'
  )
  await gotoAuthLoading(page)
  await expect(page.getByTestId('external-loading-page')).toBeVisible()
  await teacherMeResponse
  await expect(page).toHaveURL(accounts.teacher.home, { timeout: 10_000 })

  expect(runtime.meHits.length).toBeGreaterThanOrEqual(3)
  expect(runtime.refreshHits).toEqual([])
  expect(runtime.forbiddenHits).toEqual([])
  expectNoPageIssues(issues)
})

async function expectStoredSession(page: Page, role: 'teacher' | 'student' | 'admin') {
  const session = await page.evaluate(() => {
    const rawUser = window.localStorage.getItem('edugenie_user_info')
    return {
      token: window.localStorage.getItem('edugenie_access_token'),
      refreshToken: window.localStorage.getItem('edugenie_refresh_token'),
      user: rawUser ? JSON.parse(rawUser) : null
    }
  })

  expect(session.token).toBeTruthy()
  expect(session.refreshToken).toBeTruthy()
  expect(session.user?.role).toBe(role)
}
