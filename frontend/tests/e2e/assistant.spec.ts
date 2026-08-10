import { expect, test, type Page } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  ensureAdmin,
  expectNoPageIssues,
  gotoApp,
  loginViaUI,
  logoutViaUI,
  saveScreenshot
} from './helpers'

test.beforeAll(async ({ request }) => {
  await ensureAdmin(request)
})

test('assistant supports course QA, file QA, role access, and hides internal ids', async ({ page }) => {
  const issues = collectPageIssues(page)

  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/assistant')
  await expect(page.locator('.assistant-page')).toBeVisible()
  await expect(page.locator('.assistant-model-status')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.assistant-composer textarea')).toBeVisible()
  await askAssistant(page, '请结合课程知识库说明 FastAPI、Pydantic 和 Celery 的关系。')
  await expect(page.locator('.chat-message--assistant .markdown-body').last()).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('.assistant-page')).not.toContainText(/course_id|document_id|file_id/)
  await saveScreenshot(page, 'assistant-teacher-course-qa')

  const uploadResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/assistant/files/upload') && response.request().method() === 'POST'
  )
  await page.locator('.assistant-side-card input[type="file"]').setInputFiles({
    name: `assistant-e2e-${Date.now()}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('This attachment explains Redis, Celery, and course knowledge retrieval for PrismMind.', 'utf-8')
  })
  await expect((await uploadResponse).ok()).toBeTruthy()
  await expect(page.locator('.assistant-attachment-list')).toBeVisible({ timeout: 20_000 })
  await askAssistant(page, '请总结刚才上传的附件。')
  await expect(page.locator('.assistant-reference-list').last()).toBeVisible({ timeout: 45_000 })
  await saveScreenshot(page, 'assistant-file-qa')

  await logoutViaUI(page)
  await loginViaUI(page, accounts.student)
  await gotoApp(page, '/assistant')
  await expect(page.locator('.assistant-page')).toBeVisible()
  await askAssistant(page, '请给我一个适合学生复习的下一步建议。')
  await expect(page.locator('.chat-message--assistant .markdown-body').last()).toBeVisible({ timeout: 45_000 })
  await expect(page.locator('.assistant-page')).not.toContainText(/course_id|document_id|file_id/)
  await gotoApp(page, '/admin/users')
  await expect(page).not.toHaveURL(/\/admin\/users$/)
  await saveScreenshot(page, 'assistant-student')

  await logoutViaUI(page)
  await loginViaUI(page, accounts.admin)
  await gotoApp(page, '/assistant')
  await expect(page.locator('.assistant-page')).toBeVisible()
  await askAssistant(page, '请给管理员一个系统演示讲解提纲。')
  await expect(page.locator('.chat-message--assistant .markdown-body').last()).toBeVisible({ timeout: 45_000 })
  await saveScreenshot(page, 'assistant-admin')

  expectNoPageIssues(issues)
})

async function askAssistant(page: Page, question: string) {
  await page.locator('.assistant-composer textarea').fill(question)
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/v1/assistant/sessions/') && response.url().endsWith('/messages')
  )
  await page.locator('.assistant-composer .el-button--primary').click()
  await expect((await responsePromise).ok()).toBeTruthy()
}
