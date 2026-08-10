import { expect, test, type Page } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  expectExternalFullPage,
  expectNoPageIssues,
  gotoApp,
  loginViaUI
} from './helpers'

const oldApiPrefixes = [
  '/api/student',
  '/api/tutor',
  '/api/agent',
  '/api/chat',
  '/api/qa',
  '/api/resources',
  '/api/study-plan',
  '/api/paths',
  '/api/assessment',
  '/api/appraisal',
  '/api/effect',
  '/api/tests',
  '/api/exams',
  '/api/quiz',
  '/api/courses',
  '/api/my'
]

async function expectNoHorizontalScroll(page: Page) {
  const hasNoHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 5)
  expect(hasNoHorizontalScroll).toBeTruthy()
}

async function expectRootNotScaled(page: Page, selector: string) {
  const style = await page.locator(selector).first().evaluate((element) => {
    const computed = window.getComputedStyle(element)
    return {
      transform: computed.transform,
      zoom: computed.getPropertyValue('zoom') || '1'
    }
  })
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(style.transform)
  expect(Number.parseFloat(style.zoom || '1')).toBeGreaterThanOrEqual(1)
}

async function expectNaturalPageScrollIfNeeded(page: Page) {
  const result = await page.evaluate(() => {
    const before = window.scrollY
    const canScroll = document.documentElement.scrollHeight > window.innerHeight + 24
    if (!canScroll) return { canScroll, moved: true }
    window.scrollTo(0, Math.min(document.documentElement.scrollHeight, window.innerHeight + 240))
    return { canScroll, moved: window.scrollY > before }
  })
  expect(result.moved).toBeTruthy()
  await page.evaluate(() => window.scrollTo(0, 0))
}

test.beforeEach(async ({ page }) => {
  await loginViaUI(page, accounts.student)
})

test('student external tutoring and assessments use natural full-page layout', async ({ page }) => {
  const issues = collectPageIssues(page)
  const oldApiHits: string[] = []
  const tutoringApiHits: string[] = []

  page.on('request', (request) => {
    const url = new URL(request.url())
    const path = url.pathname
    if (path.startsWith('/api/v1/student/tutoring')) {
      tutoringApiHits.push(`${request.method()} ${path}`)
    }
    if (
      oldApiPrefixes.some((prefix) => path.startsWith(prefix)) ||
      `${url.hostname}:${url.port}` === 'localhost:3000' ||
      `${url.hostname}:${url.port}` === 'localhost:5000' ||
      `${url.hostname}:${url.port}` === 'localhost:8080'
    ) {
      oldApiHits.push(request.url())
    }
  })

  await gotoApp(page, '/student/tutoring')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-tutoring')).toBeVisible()
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '学习助手' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '学习记录' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '学习建议' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectNaturalPageScrollIfNeeded(page)
  await expectRootNotScaled(page, '[data-testid="external-student-tutoring"]')

  const askResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/tutoring/ask') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 60_000 }
  )
  await page.getByPlaceholder('输入你的问题...').fill('请解释课程知识库检索增强学习辅导的作用。')
  await page.getByRole('button', { name: '发送' }).click()
  await expect((await askResponse).ok()).toBeTruthy()
  await expect(page.locator('.tutor-thinking')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByText('No matching knowledge chunks were found')).toHaveCount(0)
  expect(tutoringApiHits.some((hit) => hit === 'POST /api/v1/student/tutoring/ask')).toBeTruthy()

  await gotoApp(page, '/student/assessments')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-assessments')).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectNaturalPageScrollIfNeeded(page)
  await expectRootNotScaled(page, '[data-testid="external-student-assessments"]')
  const assessmentsWidth = await page.locator('[data-testid="external-student-assessments"]').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width
  })
  const viewportWidth = page.viewportSize()?.width || 1280
  expect(assessmentsWidth).toBeGreaterThanOrEqual(viewportWidth * 0.75)

  expect(oldApiHits, oldApiHits.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
