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

const legacyApiPatterns = [
  '/api/my/courses',
  '/api/my/exercises',
  '/api/my/papers',
  '/api/training-plan/generate',
  '/api/course-design/generate',
  '/api/teaching-design/generate',
  '/api/exercises/generate',
  '/api/papers/generate',
  '/api/project-practice/generate'
]

test('teacher dashboard is the external teacher_main island with real /api/v1 navigation data', async ({ page }) => {
  test.setTimeout(120_000)
  const issues = collectPageIssues(page)
  const legacyRequests: string[] = []
  const minePanelRequests: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    const pathname = new URL(url).pathname
    if (legacyApiPatterns.some((pattern) => url.includes(pattern))) legacyRequests.push(url)
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/')) legacyRequests.push(url)
    if (
      pathname === '/api/v1/courses/my' ||
      (pathname === '/api/v1/teacher/generated-artifacts' && /artifact_type=(exercise|paper)/.test(url))
    ) {
      minePanelRequests.push(url)
    }
  })

  await loginViaUI(page, accounts.teacher)
  await expect(page).toHaveURL(/\/teacher\/dashboard$/)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-main')).toBeVisible()
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.locator('.tree-interactive-nodes')).toBeVisible()
  await expect(page.locator('.feature-sidebar')).toBeVisible()
  await expect(page.getByText('教学设计生成')).toHaveCount(0)
  await expect(page.getByText('项目实践')).toHaveCount(0)
  await expect(page.getByText('教师用户')).toHaveCount(0)
  await expect(page.getByText('Loading particle tree')).toHaveCount(0)

  const transform = await page.getByTestId('external-teacher-main').evaluate((element) =>
    window.getComputedStyle(element).transform
  )
  expect(transform === 'none' || !transform.includes('matrix')).toBeTruthy()
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
  expect(hasHorizontalOverflow).toBeFalsy()

  await page.locator('.feature-category__button[data-category-id="teaching-center"]').click()
  await page.locator('.feature-item[data-feature-id="training-plan"]').click()
  await page.locator('.enter-btn').click()
  await expect(page).toHaveURL(/\/teacher\/training-plans$/)

  await gotoApp(page, '/teacher/dashboard')
  await page.locator('.feature-category__button[data-category-id="teaching-center"]').click()
  await page.locator('.feature-item[data-feature-id="course-design"]').click()
  await page.locator('.enter-btn').click()
  await expect(page).toHaveURL(/\/teacher\/course-designs$/)

  await gotoApp(page, '/teacher/dashboard')
  await page.locator('.feature-category__button[data-category-id="toolbox"]').click()
  await page.locator('.feature-item[data-feature-id="exercise-generate"]').click()
  await page.locator('.enter-btn').click()
  await expect(page).toHaveURL(/\/teacher\/exercises$/)

  await gotoApp(page, '/teacher/dashboard')
  await page.locator('.feature-category__button[data-category-id="toolbox"]').click()
  await page.locator('.feature-item[data-feature-id="paper-generate"]').click()
  await page.locator('.enter-btn').click()
  await expect(page).toHaveURL(/\/teacher\/papers$/)

  const minePanels = [
    {
      id: 'my-courses',
      title: '我的课程',
      intro: '集中查看与管理已生成、已保存的课程资源。',
      body: '作为课程资产的入口',
      highlights: ['聚合课程设计与课程草稿', '支持后续查看、编辑与复用', '适合持续建设个人课程资源库'],
      output: '可展示课程名称、更新时间、课程状态与后续管理入口。',
      route: /\/teacher\/courses$/
    },
    {
      id: 'my-exercises',
      title: '我的习题',
      intro: '管理已生成的习题集合与专项训练资源。',
      body: '帮助教师整理不同知识点、班级或阶段的习题集合',
      highlights: ['沉淀按知识点组织的习题集合', '便于复用与二次编辑', '适合课后练习、专项训练与阶段复习'],
      output: '可展示习题集名称、题量、难度、更新时间与管理入口。',
      route: /\/teacher\/artifacts\?artifact_type=exercise$/
    },
    {
      id: 'my-papers',
      title: '我的试卷',
      intro: '查看与维护已生成的试卷与测评方案。',
      body: '集中管理试卷草稿、正式试卷与可导出的测评文件',
      highlights: ['集中管理试卷草稿与成稿', '支持后续编辑、删除与导出', '适合阶段测评、模拟考试与教学归档'],
      output: '可展示试卷名称、分值、时长、状态与导出入口。',
      route: /\/teacher\/artifacts\?artifact_type=paper$/
    }
  ]

  for (const item of minePanels) {
    await gotoApp(page, '/teacher/dashboard')
    await page.locator('.feature-category__button[data-category-id="mine"]').click()
    await page.locator(`.feature-item[data-feature-id="${item.id}"]`).click()
    await expect(page.locator('.function-panel')).toHaveClass(/is-open/)

    await expect(page.locator('.panel-title')).toHaveText(item.title)
    await expect(page.locator('.panel-intro')).toHaveText(item.intro)
    await expect(page.locator('.panel-description')).toContainText(item.body)
    await expect(page.locator('.info-section').filter({ hasText: '功能亮点' }).locator('li')).toHaveText(item.highlights)
    await expect(page.locator('.info-section').filter({ hasText: '输出内容' })).toContainText(item.output)
    await expect(page.locator('.panel-body')).not.toContainText(/加载失败|Unexpected token|<!doctype|正在加载/)
    await page.waitForTimeout(1_000)
    await saveScreenshot(page, `teacher-dashboard-${item.id}-info`)

    await page.locator('.enter-btn').click()
    await expect(page).toHaveURL(item.route)
  }

  expect(legacyRequests, legacyRequests.join('\n')).toEqual([])
  expect(minePanelRequests, minePanelRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
