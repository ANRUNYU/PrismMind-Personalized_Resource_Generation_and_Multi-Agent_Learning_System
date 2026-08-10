import { expect, type APIRequestContext, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'

export const apiBaseURL = process.env.PLAYWRIGHT_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'

export const accounts = {
  teacher: {
    username: process.env.DEMO_TEACHER_USERNAME || 'demo_teacher',
    password: process.env.DEMO_TEACHER_PASSWORD || 'DemoTeacher123!',
    role: 'teacher' as const,
    path: '/teacher/dashboard',
    home: /\/teacher\/dashboard$/
  },
  student: {
    username: process.env.DEMO_STUDENT_USERNAME || 'demo_student',
    password: process.env.DEMO_STUDENT_PASSWORD || 'DemoStudent123!',
    role: 'student' as const,
    path: '/student/dashboard',
    home: /\/student\/dashboard$/
  },
  admin: {
    username: process.env.DEMO_ADMIN_USERNAME || 'audit_admin_e2',
    email: process.env.DEMO_ADMIN_EMAIL || 'audit_admin_e2@example.com',
    password: process.env.DEMO_ADMIN_PASSWORD || 'AuditAdmin123!',
    role: 'admin' as const,
    path: '/admin/dashboard',
    home: /\/admin\/dashboard$/
  }
}

export function collectPageIssues(page: Page) {
  const issues: string[] = []
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      if (text.includes("THREE.GLTFLoader: Couldn't load texture blob:")) return
      if (!text.includes('Failed to load resource')) issues.push(`console: ${text}`)
    }
  })
  return issues
}

export function expectNoPageIssues(issues: string[]) {
  expect(issues, issues.join('\n')).toEqual([])
}

export async function ensureAdmin(request: APIRequestContext) {
  const response = await request.post(`${apiBaseURL}/auth/register`, {
    data: {
      username: accounts.admin.username,
      email: accounts.admin.email,
      password: accounts.admin.password,
      role: 'admin'
    }
  })
  if (![200, 409].includes(response.status())) {
    throw new Error(`Cannot prepare admin account: HTTP ${response.status()} ${await response.text()}`)
  }

  const login = await request.post(`${apiBaseURL}/auth/login`, {
    data: {
      username: accounts.admin.username,
      password: accounts.admin.password
    }
  })
  expect(login.ok(), await login.text()).toBeTruthy()
}

export async function gotoApp(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' }).catch((error) => {
    if (!String(error).includes('ERR_ABORTED')) throw error
  })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
}

export async function gotoAuthLoading(page: Page) {
  await page.goto('/auth/loading', { waitUntil: 'domcontentloaded' }).catch((error) => {
    if (!String(error).includes('ERR_ABORTED')) throw error
  })
}

export async function loginViaUI(
  page: Page,
  account: {
    username: string
    password: string
    role?: 'teacher' | 'student' | 'admin'
    home: RegExp
    path?: string
  }
) {
  await clearBrowserSession(page)
  await gotoApp(page, '/auth/login')
  await expect(page.getByTestId('external-login-page')).toBeVisible()
  await expect(page.getByTestId('external-login-panel')).toBeVisible()
  await page.getByPlaceholder('输入用户名').fill(account.username)
  await page.getByPlaceholder('输入密码').fill(account.password)
  if (account.role === 'teacher' || account.role === 'student') {
    await page
      .locator('.role-option')
      .filter({ hasText: account.role === 'teacher' ? '教师' : '学生' })
      .click()
  }
  const loginResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes('/api/v1/auth/login') &&
        response.request().method().toUpperCase() === 'POST',
      { timeout: 20_000 }
    )
    .catch(() => null)
  await page.getByRole('button', { name: '进入平台' }).click()
  const loginResponse = await loginResponsePromise
  if (loginResponse && !loginResponse.ok()) {
    throw new Error(`Login failed: HTTP ${loginResponse.status()} ${await loginResponse.text()}`)
  }

  const reachedHome = await page.waitForURL(account.home, { timeout: 35_000 }).then(
    () => true,
    () => false
  )
  if (!reachedHome && account.path) {
    await gotoApp(page, account.path)
  }
  await expect(page).toHaveURL(account.home, { timeout: 35_000 })
  await expectExternalFullPage(page)
}

export async function logoutViaUI(page: Page) {
  await closeTransientOverlays(page)
  const externalLogout = page.getByRole('button', { name: '退出' }).first()
  if ((await externalLogout.count()) > 0 && (await externalLogout.isVisible().catch(() => false))) {
    await externalLogout.click({ timeout: 5_000, force: true }).catch(() => undefined)
  } else if ((await page.locator('.user-menu').count()) > 0) {
    await page.locator('.user-menu').click({ timeout: 5_000, force: true }).catch(() => undefined)
    await page.getByText('退出登录', { exact: true }).click({ timeout: 5_000, force: true }).catch(() => undefined)
  } else {
    await clearBrowserSession(page)
  }
  await clearBrowserSession(page)
  await gotoApp(page, '/auth/login')
  await expect(page).toHaveURL(/\/auth\/login/)
}

async function closeTransientOverlays(page: Page) {
  await page.keyboard.press('Escape').catch(() => undefined)
  await page.waitForTimeout(300)
}

async function clearBrowserSession(page: Page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.evaluate(() => {
        try {
          window.localStorage.removeItem('access_token')
          window.localStorage.removeItem('refresh_token')
          window.localStorage.removeItem('prismmind_access_token')
          window.localStorage.removeItem('prismmind_refresh_token')
          window.localStorage.removeItem('edugenie_access_token')
          window.localStorage.removeItem('edugenie_refresh_token')
          window.localStorage.removeItem('edugenie_user_info')
          window.sessionStorage.clear()
        } catch {
          // Empty pages or browser-internal origins may not expose Web Storage.
        }
      })
      return
    } catch (error) {
      if (!String(error).includes('Execution context was destroyed') || attempt === 1) {
        throw error
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined)
    }
  }
}

export async function expectExternalFullPage(page: Page) {
  await expect(page.getByTestId('external-full-page-layout')).toBeVisible()
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
}

export async function expectLegacyMainLayout(page: Page) {
  await expect(page.getByTestId('legacy-main-layout')).toBeVisible()
  await expect(page.locator('.main-layout__content')).toBeVisible()
}

export async function saveScreenshot(page: Page, name: string) {
  const dir = path.resolve(process.cwd(), 'test-results', 'screenshots')
  await fs.mkdir(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true })
}

export async function uploadTextFile(page: Page, name: string, body: string) {
  await page.locator('input[type="file"]').first().setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(body, 'utf-8')
  })
}
