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

test('student exercises page restores my_exercises and uses real student exercise APIs', async ({ page }) => {
  const issues = collectPageIssues(page)
  const legacyRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (
      url.includes('/api/exercises') ||
      url.includes('/api/exercises/submit') ||
      url.includes('/api/student/exercises') ||
      url.includes('/api/user/') ||
      url.includes('/api/auth/')
    ) {
      legacyRequests.push(url)
    }
  })

  await gotoApp(page, '/student/exercises')
  await expect(page).toHaveURL(/\/student\/exercises$/)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-exercises')).toBeVisible()
  await expect(page.getByTestId('external-mine-exercises')).toHaveCount(0)
  await expect(page.locator('.change-page')).toHaveCount(0)
  await expect(page.locator('.mine-exercises-page')).toBeVisible()
  await expect(page.getByText('通过当前 /api/v1')).toHaveCount(0)
  await expect(page.getByText('课程作业接口')).toHaveCount(0)
  await expect(page.getByText('assignments')).toHaveCount(0)
  await expect(page.getByText('/api/exercises')).toHaveCount(0)

  await expect(page.locator('.exercise-card, .exercise-empty-state').first()).toBeVisible({ timeout: 20_000 })
  await page.locator('.search-box input').fill('FastAPI')
  await page.locator('.search-box input').fill('')

  const createResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/student/exercises') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: /添加习题/ }).click()
  await expect((await createResponse).ok()).toBeTruthy()

  const personalCard = page.locator('[data-exercise-source="personal"]').first()
  await expect(personalCard).toBeVisible({ timeout: 20_000 })
  await personalCard.locator('.detail-link').click()
  const detail = page.getByTestId('external-student-exercises-detail')
  await expect(detail).toBeVisible()
  await expect(detail.getByText('通过当前 /api/v1')).toHaveCount(0)
  await expect(detail.getByText('课程作业接口')).toHaveCount(0)
  await expect(detail.getByText(/^API$/)).toHaveCount(0)

  const startResponse = page.waitForResponse((response) => response.url().includes('/api/v1/student/exercises/') && response.url().endsWith('/start'))
  await detail.getByRole('button', { name: '开始作答' }).click()
  await expect((await startResponse).ok()).toBeTruthy()

  await expect(detail.locator('textarea:not([disabled])').first()).toBeVisible({ timeout: 15_000 })
  await detail.locator('textarea:not([disabled])').first().fill('FastAPI 路由可以通过依赖注入获取当前用户和业务服务，并完成受保护的作答流程。')

  const submitResponse = page.waitForResponse((response) => response.url().includes('/api/v1/student/exercises/') && response.url().endsWith('/submit'))
  await detail.getByRole('button', { name: '提交答案' }).click()
  await expect((await submitResponse).ok()).toBeTruthy()
  await expect(detail.getByText('答案已提交，学习反馈已更新。')).toBeVisible({ timeout: 20_000 })

  const favoriteResponse = page.waitForResponse((response) => response.url().includes('/api/v1/student/exercises/') && response.url().endsWith('/favorite'))
  await detail.getByRole('button', { name: '收藏' }).click()
  await expect((await favoriteResponse).ok()).toBeTruthy()

  const completeResponse = page.waitForResponse((response) => response.url().includes('/api/v1/student/exercises/') && response.url().endsWith('/complete'))
  await detail.getByRole('button', { name: '标记完成' }).click()
  await expect((await completeResponse).ok()).toBeTruthy()

  const deleteResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/student/exercises/') && response.request().method() === 'DELETE'
  )
  await detail.getByRole('button', { name: '删除习题' }).click()
  await expect((await deleteResponse).ok()).toBeTruthy()

  const layout = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="external-student-exercises"]') as HTMLElement | null
    const style = root ? window.getComputedStyle(root) : null
    return {
      rootExists: Boolean(root),
      transform: style?.transform || 'none',
      zoom: style?.getPropertyValue('zoom') || '1',
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }
  })
  expect(layout.rootExists).toBeTruthy()
  expect(layout.transform).toBe('none')
  expect(Number.parseFloat(layout.zoom || '1')).toBeCloseTo(1)
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 4)

  await saveScreenshot(page, 'student-exercises')
  expect(legacyRequests).toEqual([])
  expectNoPageIssues(issues)
})

test('student exercises logout clears the island session and redirects to login', async ({ page }) => {
  await gotoApp(page, '/student/exercises')
  await expect(page.getByTestId('external-student-exercises')).toBeVisible()
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page).toHaveURL(/\/auth\/login/)
  const tokens = await page.evaluate(() => ({
    access: window.localStorage.getItem('access_token'),
    refresh: window.localStorage.getItem('refresh_token'),
    prismAccess: window.localStorage.getItem('prismmind_access_token'),
    eduAccess: window.localStorage.getItem('edugenie_access_token')
  }))
  expect(tokens).toEqual({ access: null, refresh: null, prismAccess: null, eduAccess: null })
})
