import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import {
  accounts,
  apiBaseURL,
  collectPageIssues,
  expectExternalFullPage,
  expectNoPageIssues,
  gotoApp,
  loginViaUI,
  saveScreenshot
} from './helpers'

async function loginViaApi(request: APIRequestContext, account: { username: string; password: string }) {
  const response = await request.post(`${apiBaseURL}/auth/login`, {
    data: {
      username: account.username,
      password: account.password
    }
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  const payload = (await response.json()) as { data: { access_token: string } }
  return payload.data.access_token
}

async function createCourseByApi(request: APIRequestContext, token: string, name: string) {
  const response = await request.post(`${apiBaseURL}/courses`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    data: {
      name,
      description: 'Playwright 创建的外部课程页回归课程。'
    }
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  const payload = (await response.json()) as {
    data: {
      id: number
      code: string
      invite_code?: string
      name: string
    }
  }
  return payload.data
}

async function collectCardStageMetrics(page: Page) {
  return page.evaluate(() => {
    const parseTranslateZ = (transform: string) => {
      const matrix3d = transform.match(/matrix3d\(([^)]+)\)/)
      if (matrix3d) {
        const values = matrix3d[1].split(',').map((item) => Number.parseFloat(item.trim()))
        return values[14] || 0
      }
      const translate3d = transform.match(/translate3d\([^,]+,[^,]+,\s*([-\d.]+)px\)/)
      return translate3d ? Number.parseFloat(translate3d[1]) : 0
    }

    const scene = document.querySelector('.lesson-scene-layer')
    const stage = document.querySelector('.lesson-card-system')
    const cards = [...document.querySelectorAll('[data-card="student-course"], .lesson-prism-card')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          className: String(element.className),
          zIndex: Number.parseInt(style.zIndex || '0', 10) || 0,
          opacity: Number.parseFloat(style.opacity || '1'),
          transform: style.transform,
          translateZ: parseTranslateZ(style.transform),
          pointerEvents: style.pointerEvents,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) || ''
        }
      })

    const byZ = [...cards].sort((a, b) => b.zIndex - a.zIndex)
    const byDepth = [...cards].sort((a, b) => b.translateZ - a.translateZ)
    const sceneStyle = scene ? window.getComputedStyle(scene) : null
    const stageStyle = stage ? window.getComputedStyle(stage) : null
    const cardParts = [...document.querySelectorAll('.prism-card-face, .prism-card-side')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => window.getComputedStyle(element).backfaceVisibility)

    return {
      count: cards.length,
      frontText: byZ[0]?.text || '',
      frontZIndex: byZ[0]?.zIndex || 0,
      secondZIndex: byZ[1]?.zIndex || 0,
      frontTranslateZ: byZ[0]?.translateZ || 0,
      secondTranslateZ: byZ[1]?.translateZ || 0,
      maxDepthTranslateZ: byDepth[0]?.translateZ || 0,
      maxDepthZIndex: byDepth[0]?.zIndex || 0,
      frontOpacity: byZ[0]?.opacity || 0,
      secondOpacity: byZ[1]?.opacity || 0,
      sceneOverflowX: sceneStyle?.overflowX || '',
      sceneOverflowY: sceneStyle?.overflowY || '',
      scenePerspective: sceneStyle?.perspective || '',
      stageTransformStyle: stageStyle?.transformStyle || '',
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      cardPartsBackfaceHidden: cardParts.every((value) => value === 'hidden')
    }
  })
}

test('public file center uploads a batch and shows per-file results', async ({ page }) => {
  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/teacher/files')
  const input = page.locator('input[type="file"]').first()
  await input.setInputFiles([
    { name: `batch-${Date.now()}-a.txt`, mimeType: 'application/octet-stream', buffer: Buffer.from('批量文件 A') },
    { name: `batch-${Date.now()}-b.md`, mimeType: 'application/octet-stream', buffer: Buffer.from('# 批量文件 B') }
  ])
  await page.getByRole('button', { name: /上传 2 个文件/ }).click()
  await expect(page.locator('.result-row')).toHaveCount(2)
  await expect(page.locator('.result-row').filter({ hasText: '失败' })).toHaveCount(0)
})

test('student courses uses mine my_lessons page with real course APIs', async ({ page, request }) => {
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []
  const apiHits = {
    list: 0,
    detail: 0,
    join: 0,
    assignments: 0
  }

  page.on('request', (apiRequest) => {
    const url = apiRequest.url()
    const parsedUrl = new URL(url)
    const path = parsedUrl.pathname
    if (
      path.startsWith('/api/courses') ||
      path.startsWith('/api/user') ||
      path.startsWith('/api/auth') ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:3000' ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:5000' ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:8080'
    ) {
      forbiddenRequests.push(url)
    }
    if (url.includes('/api/v1/courses/my')) apiHits.list += 1
    if (url.includes('/api/v1/courses/join')) apiHits.join += 1
    if (/\/api\/v1\/courses\/\d+($|\?)/.test(url)) apiHits.detail += 1
    if (/\/api\/v1\/courses\/\d+\/assignments($|\?)/.test(url)) apiHits.assignments += 1
  })

  const courseName = `test_my_lessons_${Date.now()}`
  const teacherToken = await loginViaApi(request, accounts.teacher)
  const course = await createCourseByApi(request, teacherToken, courseName)
  const code = course.code || course.invite_code
  expect(code).toBeTruthy()

  await loginViaUI(page, accounts.student)
  await gotoApp(page, '/student/courses')

  await expect(page).toHaveURL(/\/student\/courses$/)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-courses')).toBeVisible()
  await expect(page.locator('.mine-lessons-page')).toBeVisible()
  await expect(page.locator('.search-box input')).toBeVisible()
  await expect(page.locator('.join-code-box input')).toBeVisible()
  await expect(page.locator('.stats-panel')).toBeVisible()
  await expect(page.locator('.lesson-detail-panel')).toBeVisible()
  await expect(page.locator('.main-layout__content')).toHaveCount(0)
  await expect(page.getByTestId('external-loading')).toHaveCount(0, { timeout: 20_000 })

  await page.locator('.search-box input').fill('不会命中的课程关键字')
  await expect(page.getByText('没有匹配的课程')).toBeVisible({ timeout: 20_000 })
  await page.locator('.search-box input').fill('')

  await page.locator('.join-code-box input').fill(code)
  const joinResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/courses/join') && response.request().method() === 'POST'
  )
  await page.locator('.toolbar-row .add-button').first().click()
  await expect((await joinResponse).ok()).toBeTruthy()

  const courseCard = page.locator('[data-course-id]').filter({ hasText: courseName }).first()
  await expect(courseCard).toBeVisible({ timeout: 20_000 })

  const cardStageBeforeWheel = await collectCardStageMetrics(page)
  expect(cardStageBeforeWheel.count).toBeGreaterThan(0)
  expect(cardStageBeforeWheel.sceneOverflowX).toBe('hidden')
  expect(cardStageBeforeWheel.sceneOverflowY).toBe('hidden')
  expect(cardStageBeforeWheel.scenePerspective).toBe('1200px')
  expect(cardStageBeforeWheel.stageTransformStyle).toBe('preserve-3d')
  expect(cardStageBeforeWheel.frontZIndex).toBeGreaterThan(cardStageBeforeWheel.secondZIndex)
  expect(cardStageBeforeWheel.frontTranslateZ).toBeGreaterThanOrEqual(cardStageBeforeWheel.secondTranslateZ)
  expect(cardStageBeforeWheel.maxDepthZIndex).toBe(cardStageBeforeWheel.frontZIndex)
  expect(cardStageBeforeWheel.cardPartsBackfaceHidden).toBeTruthy()
  expect(cardStageBeforeWheel.documentWidth).toBeLessThanOrEqual(cardStageBeforeWheel.viewportWidth + 1)

  await page.locator('.lesson-card-system').hover()
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, 260)
  }
  await page.waitForTimeout(1_200)
  const cardStageAfterWheel = await collectCardStageMetrics(page)
  expect(cardStageAfterWheel.frontZIndex).toBeGreaterThan(cardStageAfterWheel.secondZIndex)
  expect(cardStageAfterWheel.frontTranslateZ).toBeGreaterThanOrEqual(cardStageAfterWheel.secondTranslateZ)
  expect(cardStageAfterWheel.maxDepthZIndex).toBe(cardStageAfterWheel.frontZIndex)
  expect(cardStageAfterWheel.frontOpacity).toBeGreaterThanOrEqual(cardStageAfterWheel.secondOpacity)
  expect(cardStageAfterWheel.documentWidth).toBeLessThanOrEqual(cardStageAfterWheel.viewportWidth + 1)
  if (cardStageAfterWheel.count > 1) {
    expect(cardStageAfterWheel.frontText).not.toBe(cardStageBeforeWheel.frontText)
  }

  await page.locator('.search-box input').fill(courseName)
  await expect(courseCard).toBeVisible({ timeout: 20_000 })
  await page.locator('.search-box input').fill('')

  const refreshResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/courses/my') && response.request().method() === 'GET'
  )
  await page.locator('.toolbar-row .add-button--subtle').click()
  await expect((await refreshResponse).ok()).toBeTruthy()

  await courseCard.click({ force: true })
  await expect(page.locator('.lesson-detail-panel').filter({ hasText: courseName })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.lesson-detail-panel').filter({ hasText: 'Playwright 创建的外部课程页回归课程。' })).toBeVisible({
    timeout: 20_000
  })
  await expect(page.locator('.lesson-detail-panel').filter({ hasText: '暂无任务' })).toBeVisible({ timeout: 20_000 })

  await expect(page.getByRole('button', { name: /收藏|完成课程|删除/ })).toHaveCount(0)
  for (const text of ['通过当前 /api/v1', '课程接口', '后端暂无能力', 'ApiAdapter', 'fallbackCourses', 'mock', 'fallback']) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0)
  }
  await expect(page.getByText('/api/courses')).toHaveCount(0)
  await saveScreenshot(page, 'student-courses')

  await page.locator('.lesson-detail-panel .primary-action').click()
  await expect(page).toHaveURL(new RegExp(`/student/courses/${course.id}$`), { timeout: 20_000 })
  await expect(page.getByText(courseName).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(String(code)).first()).toBeVisible({ timeout: 20_000 })

  await gotoApp(page, '/student/courses')
  await page.evaluate(() => {
    window.localStorage.setItem('access_token', 'demo-access')
    window.localStorage.setItem('refresh_token', 'demo-refresh')
    window.localStorage.setItem('prismmind_extra_token', 'demo-prism')
    window.localStorage.setItem('edugenie_extra_token', 'demo-edu')
    window.sessionStorage.setItem('edugenie_session_token', 'demo-session')
  })
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 })
  const remainingSessionKeys = await page.evaluate(() =>
    ['access_token', 'refresh_token', 'prismmind_extra_token', 'edugenie_extra_token', 'edugenie_session_token'].filter(
      (key) => window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    )
  )
  expect(remainingSessionKeys).toEqual([])

  expect(apiHits.list).toBeGreaterThan(0)
  expect(apiHits.join).toBeGreaterThan(0)
  expect(apiHits.detail).toBeGreaterThan(0)
  expect(apiHits.assignments).toBeGreaterThan(0)
  expect(forbiddenRequests).toEqual([])
  expectNoPageIssues(issues)
})
