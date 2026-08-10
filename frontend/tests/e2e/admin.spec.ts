import { expect, test } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  ensureAdmin,
  expectExternalFullPage,
  expectNoPageIssues,
  gotoApp,
  loginViaUI,
  saveScreenshot
} from './helpers'

test.beforeAll(async ({ request }) => {
  await ensureAdmin(request)
})

test('external React admin dashboard and users page load real users', async ({ page }) => {
  const issues = collectPageIssues(page)

  await loginViaUI(page, accounts.admin)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-admin-dashboard')).toBeVisible()
  await expect(page.getByRole('heading', { name: '系统运行概览' })).toBeVisible()
  await expect(page.locator('.prism-my-exams.external-admin-dashboard')).toBeVisible()
  await expect(page.locator('.exam-card')).toHaveCount(3)
  await expect(page.getByText('用户总数')).toBeVisible()
  await expect(page.locator('.prism-admin-dashboard')).toHaveCount(0)

  await gotoApp(page, '/admin/users')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-admin-users')).toBeVisible()
  await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible()
  await expect(page.locator('.prism-my-exams.external-admin-users')).toBeVisible()
  await expect(page.locator('.external-users-table')).toBeVisible()
  await expect(page.locator('.el-table')).toHaveCount(0)

  const firstRow = page.locator('.external-users-table tbody tr').first()
  await expect(firstRow).toBeVisible()
  const firstUsername = (await firstRow.locator('td').nth(1).innerText()).trim()
  await page.getByPlaceholder('按用户名或邮箱筛选').fill(firstUsername)
  await expect(page.locator('.external-users-table tbody tr').filter({ hasText: firstUsername }).first()).toBeVisible()

  await page.getByPlaceholder('按用户名或邮箱筛选').fill('')
  const currentAdminRow = page.locator('.external-users-table tbody tr').filter({ hasText: accounts.admin.username }).first()
  if ((await currentAdminRow.count()) > 0) {
    await expect(currentAdminRow.getByRole('button', { name: '禁用' })).toBeDisabled()
  }
  await saveScreenshot(page, 'admin-users')

  expectNoPageIssues(issues)
})

test('non-admin users are redirected away from /admin/users', async ({ page }) => {
  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/admin/users')
  await expect(page).toHaveURL(/\/teacher\/dashboard$/)
})
