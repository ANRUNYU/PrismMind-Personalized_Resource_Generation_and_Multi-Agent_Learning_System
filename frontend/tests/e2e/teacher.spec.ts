import { expect, test, type Page } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  expectExternalFullPage,
  expectLegacyMainLayout,
  expectNoPageIssues,
  gotoApp,
  loginViaUI,
  saveScreenshot,
  uploadTextFile
} from './helpers'

const teacherMainHotspots = [
  { id: 'training-plan', title: '智能培养方案生成', url: /\/teacher\/training-plans$/ },
  { id: 'course-design', title: '课程设计生成', url: /\/teacher\/course-designs$/ },
  { id: 'exercise-generate', title: '习题批量生成', url: /\/teacher\/exercises$/ },
  { id: 'paper-generate', title: '试卷智能生成', url: /\/teacher\/papers$/ },
  { id: 'my-courses', title: '我的课程', url: /\/teacher\/courses$/ },
  { id: 'my-exercises', title: '我的习题', url: /\/teacher\/artifacts\?artifact_type=exercise$/ },
  { id: 'my-papers', title: '我的试卷', url: /\/teacher\/artifacts\?artifact_type=paper$/ }
]

test.beforeEach(async ({ page }) => {
  await loginViaUI(page, accounts.teacher)
})

test('external Teacher generation pages use real /api/v1 generation and history', async ({ page }) => {
  test.setTimeout(220_000)
  const issues = collectPageIssues(page)

  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-main')).toBeVisible()
  await saveScreenshot(page, 'teacher-dashboard')

  await gotoApp(page, '/teacher/artifacts')
  await expectLegacyMainLayout(page)
  await expect(page.locator('.table-card')).toBeVisible()
  await saveScreenshot(page, 'teacher-artifacts')
  const detailButtons = page.locator('.el-table__row button').first()
  if (await detailButtons.count()) {
    await expect(detailButtons).toBeVisible()
    await Promise.all([
      page.waitForURL(/\/teacher\/artifacts\/\d+/, { timeout: 20_000 }),
      detailButtons.click()
    ])
    await expect(page.locator('.markdown-viewer')).toBeVisible()
    await expect(page.locator('.quality-panel')).toBeVisible()
  }

  expectNoPageIssues(issues)
})

test('teacher main page exposes teacher_main entries and removes deprecated entries', async ({ page }) => {
  test.setTimeout(180_000)
  const issues = collectPageIssues(page)
  const blockedRequests: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('localhost:3000') || url.includes('localhost:5000') || url.includes('localhost:8080')) {
      blockedRequests.push(url)
    }
    if (url.includes('/api/teacher') || url.includes('/api/dashboard') || url.includes('/api/user') || url.includes('/api/me') || url.includes('/api/profile')) {
      blockedRequests.push(url)
    }
  })

  await gotoApp(page, '/teacher/dashboard')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-main')).toBeVisible()
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.getByText('教学设计生成')).toHaveCount(0)
  await expect(page.getByText('项目实践')).toHaveCount(0)
  await expect(page.getByText(/API|接口|mock|fallback|后端暂无能力/i)).toHaveCount(0)
  await assertTeacherMainHotspots(page)

  await page.getByRole('button', { name: '用户' }).click()
  await expect(page.locator('#teacher-user-name')).toBeVisible()
  await expect(page.locator('#teacher-user-name')).not.toHaveText('教师用户')
  await expect(page.locator('#teacher-user-role')).toContainText(/教师工作台|管理成员/)

  const expectedEntries = [
    { category: '教学中心', name: '智能培养方案生成', url: /\/teacher\/training-plans$/ },
    { category: '教学中心', name: '课程设计生成', url: /\/teacher\/course-designs$/ },
    { category: '工具箱', name: '习题批量生成', url: /\/teacher\/exercises$/ },
    { category: '工具箱', name: '试卷智能生成', url: /\/teacher\/papers$/ },
    { category: '我的', name: '我的课程', url: /\/teacher\/courses$/ },
    { category: '我的', name: '我的习题', url: /\/teacher\/artifacts\?artifact_type=exercise$/ },
    { category: '我的', name: '我的试卷', url: /\/teacher\/artifacts\?artifact_type=paper$/ }
  ]

  for (const entry of expectedEntries) {
    await gotoApp(page, '/teacher/dashboard')
    await expect(page.getByTestId('external-teacher-main')).toBeVisible()
    const categoryButton = page.locator('.feature-category__button').filter({ hasText: entry.category }).first()
    await categoryButton.click()
    await page.locator('.feature-item').filter({ hasText: entry.name }).first().click()
    await expect(page.locator('.panel-title')).toHaveText(entry.name)
    await page.locator('.enter-btn').click()
    await expect(page).toHaveURL(entry.url, { timeout: 20_000 })
    if (entry.url.test('/teacher/courses')) {
      await expectExternalFullPage(page)
      await expect(page.getByTestId('external-teacher-courses')).toBeVisible()
    }
  }

  await gotoApp(page, '/teacher/dashboard')
  await page.evaluate(() => {
    localStorage.setItem('access_token', 'teacher-main-access')
    localStorage.setItem('refresh_token', 'teacher-main-refresh')
    localStorage.setItem('prismmind_probe', 'teacher-main-prism')
    localStorage.setItem('edugenie_probe', 'teacher-main-edu')
    sessionStorage.setItem('prismmind_probe', 'teacher-main-session')
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

  expect(blockedRequests, blockedRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})

async function assertTeacherMainHotspots(page: Page) {
  const expectedIds = teacherMainHotspots.map((item) => item.id)
  await page.locator('.tree-node').first().waitFor({ state: 'visible', timeout: 20_000 })
  await expect(page.locator('.tree-node')).toHaveCount(teacherMainHotspots.length)

  const metrics = await collectTeacherMainHotspotMetrics(page, expectedIds)
  expect(metrics.count).toBe(teacherMainHotspots.length)
  expect(metrics.ids).toEqual(expectedIds)
  expect(metrics.deletedLabels).toEqual([])
  console.info(
    `[teacher-main] hotspot min distance ${metrics.minDistance.toFixed(2)}px (${metrics.nearestPair.join(' <-> ')})`
  )
  expect(metrics.minDistance).toBeGreaterThan(48)
  expect(metrics.topNavOverlaps, JSON.stringify(metrics.topNavOverlaps, null, 2)).toEqual([])
  expect(metrics.menuOverlaps, JSON.stringify(metrics.menuOverlaps, null, 2)).toEqual([])
  expect(metrics.outOfViewport, JSON.stringify(metrics.outOfViewport, null, 2)).toEqual([])

  for (const entry of teacherMainHotspots) {
    await gotoApp(page, '/teacher/dashboard')
    await expect(page.getByTestId('external-teacher-main')).toBeVisible()
    const node = page.locator(`.tree-node[data-feature-id="${entry.id}"]`)
    await expect(node).toBeVisible()
    await node.hover()
    await expect(node).toHaveClass(/is-hovered/)
    await node.click()
    await expect(node).toHaveClass(/is-active/)
    await expect(page.locator('.panel-title')).toHaveText(entry.title)
    await page.locator('.enter-btn').click()
    await expect(page).toHaveURL(entry.url, { timeout: 20_000 })
    if (entry.id === 'my-courses') {
      await expectExternalFullPage(page)
      await expect(page.getByTestId('external-teacher-courses')).toBeVisible()
    }
  }

  await gotoApp(page, '/teacher/dashboard')
}

async function collectTeacherMainHotspotMetrics(page: Page, expectedIds: string[]) {
  return page.evaluate((ids) => {
    const host = document.querySelector('[data-testid="external-teacher-vanilla-host"]') as HTMLElement | null
    const root = host?.shadowRoot || null
    const rectToObject = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    }
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0.01
    }
    const intersects = (
      a: { left: number; top: number; right: number; bottom: number },
      b: { left: number; top: number; right: number; bottom: number }
    ) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

    const nodes = root
      ? [...root.querySelectorAll('.tree-node')]
          .filter(isVisible)
          .map((element) => ({
            id: (element as HTMLElement).dataset.featureId || '',
            ariaLabel: element.getAttribute('aria-label') || '',
            ...rectToObject(element)
          }))
      : []
    const ordered = ids.map((id) => nodes.find((node) => node.id === id)).filter(Boolean) as typeof nodes
    const topNav = root?.querySelector('.top-nav')
    const topNavRect = topNav ? rectToObject(topNav) : null
    const menuRects = root
      ? [...root.querySelectorAll('.feature-category__button, .feature-item')]
          .filter(isVisible)
          .map((element) => ({ text: element.textContent?.trim() || '', ...rectToObject(element) }))
      : []

    let minDistance = Number.POSITIVE_INFINITY
    let nearestPair: string[] = []
    for (let i = 0; i < ordered.length; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const a = ordered[i]
        const b = ordered[j]
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        if (distance < minDistance) {
          minDistance = distance
          nearestPair = [a.id, b.id]
        }
      }
    }

    return {
      count: nodes.length,
      ids: ordered.map((node) => node.id),
      deletedLabels: nodes
        .map((node) => node.ariaLabel)
        .filter((label) => label.includes('教学设计生成') || label.includes('项目实践生成')),
      minDistance,
      nearestPair,
      topNavOverlaps: topNavRect ? ordered.filter((node) => intersects(node, topNavRect)).map((node) => node.id) : [],
      menuOverlaps: ordered.flatMap((node) =>
        menuRects.filter((menu) => intersects(node, menu)).map((menu) => ({ node: node.id, menu: menu.text }))
      ),
      outOfViewport: ordered
        .filter((node) => node.left < 0 || node.top < 0 || node.right > window.innerWidth || node.bottom > window.innerHeight)
        .map((node) => node.id)
    }
  }, expectedIds)
}

test('teacher files, knowledge, and tasks remain usable', async ({ page }) => {
  test.setTimeout(140_000)
  const issues = collectPageIssues(page)

  await gotoApp(page, '/teacher/files')
  await expectLegacyMainLayout(page)
  await expect(page.locator('.upload-panel')).toBeVisible()
  await uploadTextFile(page, `e2e-file-${Date.now()}.txt`, 'PrismMind E2E file upload content for knowledge base.')
  await expect(page.locator('.table-card')).toBeVisible()

  await gotoApp(page, '/teacher/knowledge')
  await expectLegacyMainLayout(page)
  await expect(page.locator('.knowledge-create-card')).toBeVisible()
  const uploadResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/files/upload') && response.request().method() === 'POST' && response.ok()
  )
  await uploadTextFile(page, `e2e-knowledge-${Date.now()}.txt`, 'PrismMind knowledge document about RAG, profile, and assessment.')
  await uploadResponse
  await page.locator('.knowledge-create-card .el-button--primary').click()
  await expect(page.locator('.el-message').first()).toBeVisible()
  const ingestButtons = page.locator('.el-table__row button').filter({ hasText: /同步|鍚屾/ })
  if (await ingestButtons.count()) {
    await ingestButtons.first().click()
  }
  await page.locator('.retrieve-tester textarea').fill('PrismMind 如何使用 RAG 和画像？')
  await page.locator('.retrieve-tester .el-button--primary').click()
  await expect(page.locator('.retrieve-results')).toBeVisible()
  await saveScreenshot(page, 'teacher-knowledge')

  await gotoApp(page, '/tasks')
  await expectLegacyMainLayout(page)
  await expect(page.locator('.task-center, .page-stack, .main-layout__content')).toBeVisible()
  await saveScreenshot(page, 'tasks-page')

  expectNoPageIssues(issues)
})
