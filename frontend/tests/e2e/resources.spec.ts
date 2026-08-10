import { expect, test } from '@playwright/test'

import { accounts, collectPageIssues, expectExternalFullPage, expectNoPageIssues, gotoApp, loginViaUI } from './helpers'

interface ResourceDetailPayload {
  title?: string
  profile_snapshot?: Record<string, unknown> | null
  reference_snapshot?: Array<{ source_filename?: string | null }> | null
  quality_analysis?: Record<string, unknown> | null
}

test.beforeEach(async ({ page }) => {
  await loginViaUI(page, accounts.student)
})

test('student resources page uses resources_access template and real resource APIs', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1366, height: 768 })
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []
  const resourceRequests: string[] = []

  page.on('request', (request) => {
    const parsed = new URL(request.url())
    const path = parsed.pathname
    if (path.startsWith('/api/v1/student/resources')) {
      resourceRequests.push(`${request.method()} ${path}`)
    }
    if (
      path.startsWith('/api/resource-center') ||
      path.startsWith('/api/resources') ||
      path.startsWith('/api/resource') ||
      path.startsWith('/api/student/resources') ||
      path.startsWith('/api/user') ||
      path.startsWith('/api/me') ||
      `${parsed.hostname}:${parsed.port}` === 'localhost:3000' ||
      `${parsed.hostname}:${parsed.port}` === 'localhost:5000' ||
      `${parsed.hostname}:${parsed.port}` === 'localhost:8080'
    ) {
      forbiddenRequests.push(request.url())
    }
  })

  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/resources') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await gotoApp(page, '/student/resources')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-resources')).toBeVisible()
  await expect(page.locator('.resource-center-page .top-nav')).toBeVisible()
  await expect(page.locator('.resource-center-page .resource-hero-copy')).toBeVisible()
  await expect(page.locator('.resource-center-page .resource-generator-panel')).toBeVisible()
  await expect(page.locator('.resource-center-page .resource-list-panel')).toBeVisible()
  await expect((await listResponse).ok()).toBeTruthy()
  await expect(page.getByTestId('external-loading')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByText(/Connected to|Using local|接口|mock|fallback|后端暂无|后端未|API/)).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)

  await assertNoHorizontalOverflow(page)
  await assertResourceFixedViewport(page)

  const searchResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/resources') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await page.getByPlaceholder('搜索主题或标题').fill('PrismMind')
  await page.locator('.resource-filter-bar').getByRole('button', { name: '搜索' }).click()
  await expect((await searchResponse).ok()).toBeTruthy()

  const filterResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/resources') &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 20_000 }
  )
  await page.locator('.resource-filter-bar select').first().selectOption('课程文档')
  await page.locator('.resource-filter-bar').getByRole('button', { name: '搜索' }).click()
  await expect((await filterResponse).ok()).toBeTruthy()

  const resourceTopic = `资源中心专项 ${Date.now()}`
  await page.getByPlaceholder('搜索主题或标题').fill('')
  await page.locator('.resource-filter-bar select').first().selectOption('')
  await page.locator('.resource-filter-bar select').nth(1).selectOption('')
  await page.getByPlaceholder('例如：过拟合与正则化').fill(resourceTopic)
  const generateResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/student/resources/generate') &&
      response.request().method() === 'POST' &&
      response.status() < 500,
    { timeout: 60_000 }
  )
  const generatedDetailResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/student\/resources\/\d+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'GET' &&
      response.status() < 500,
    { timeout: 180_000 }
  )
  await page.getByRole('button', { name: '生成资源', exact: true }).click()
  const resourceProgress = page.getByTestId('resource-task-progress')
  await expect(resourceProgress).toBeVisible()
  await expect(resourceProgress.getByRole('progressbar')).toBeVisible()
  await expect(resourceProgress).toContainText(/%/)
  await expect((await generateResponse).ok()).toBeTruthy()
  await expect(page.getByTestId('resource-task-progress').getByRole('progressbar')).toBeVisible({ timeout: 20_000 })
  const generatedDetail = await generatedDetailResponse
  await expect(generatedDetail.ok()).toBeTruthy()
  const generatedDetailBody = (await generatedDetail.json()) as ResourceDetailPayload & { data?: ResourceDetailPayload }
  const generatedResource = generatedDetailBody.data || generatedDetailBody
  await expect(page).toHaveURL(/\/student\/resources\/\d+$/, { timeout: 180_000 })
  await expect(page.locator('.resource-detail-page')).toBeVisible()
  await expect(page.locator('.resource-detail-hero h1')).toContainText(resourceTopic)
  await assertResourceDetailLayout(page)
  await assertResourceDetailDataTruth(page, generatedResource)
  await expect(page.getByRole('heading', { name: '完整正文' })).toBeVisible()

  const returnListResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/student/resources') && response.request().method() === 'GET',
    { timeout: 20_000 }
  )
  await page.getByRole('link', { name: /返回资源列表/ }).click()
  await expect((await returnListResponse).ok()).toBeTruthy()

  const resourceRow = page.locator('.resource-list-panel article.resource-item').filter({ hasText: resourceTopic }).first()
  await expect(resourceRow).toBeVisible({ timeout: 150_000 })

  const rowDetailResponse = page.waitForResponse(
    (response) => /\/api\/v1\/student\/resources\/\d+$/.test(new URL(response.url()).pathname) && response.request().method() === 'GET',
    { timeout: 20_000 }
  )
  await resourceRow.getByRole('button', { name: '查看' }).click()
  await expect((await rowDetailResponse).ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/student\/resources\/\d+$/)
  await expect(page.locator('.resource-detail-page')).toBeVisible()
  await page.getByRole('link', { name: /返回资源列表/ }).click()
  await expect(page).toHaveURL(/\/student\/resources$/)

  await page.evaluate(() => {
    window.localStorage.setItem('access_token', 'resources-access-token')
    window.localStorage.setItem('refresh_token', 'resources-refresh-token')
    window.localStorage.setItem('prismmind_probe', '1')
    window.localStorage.setItem('edugenie_probe', '1')
    window.sessionStorage.setItem('edugenie_session_probe', '1')
  })
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await expect(page).toHaveURL(/\/student\/dashboard$/)
  await gotoApp(page, '/student/resources')
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page).toHaveURL(/\/auth\/login/)
  const storageState = await page.evaluate(() => ({
    access: window.localStorage.getItem('access_token'),
    refresh: window.localStorage.getItem('refresh_token'),
    prismProbe: window.localStorage.getItem('prismmind_probe'),
    edugenieProbe: window.localStorage.getItem('edugenie_probe'),
    sessionProbe: window.sessionStorage.getItem('edugenie_session_probe')
  }))
  expect(storageState).toEqual({
    access: null,
    refresh: null,
    prismProbe: null,
    edugenieProbe: null,
    sessionProbe: null
  })

  expect(resourceRequests.some((hit) => hit === 'GET /api/v1/student/resources')).toBeTruthy()
  expect(resourceRequests.some((hit) => hit === 'POST /api/v1/student/resources/generate-async')).toBeTruthy()
  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const metrics = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="external-student-resources"]') as HTMLElement | null
    const style = root ? window.getComputedStyle(root) : null
    const rightEdge = document.elementFromPoint(window.innerWidth - 1, Math.floor(window.innerHeight / 2))
    const horizontalScrollContainers: Array<{ tag: string; className: string; clientWidth: number; scrollWidth: number }> = []
    document.querySelectorAll('*').forEach((element) => {
      const elementStyle = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const visible = rect.width > 0 && rect.height > 0 && elementStyle.visibility !== 'hidden' && elementStyle.display !== 'none'
      if (!visible) return
      if (elementStyle.overflowX === 'scroll' || (elementStyle.overflowX === 'auto' && element.scrollWidth > element.clientWidth + 1)) {
        horizontalScrollContainers.push({
          tag: element.tagName,
          className: String(element.className || ''),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth
        })
      }
    })

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      rootWidth: root?.scrollWidth || 0,
      rootClientWidth: root?.clientWidth || 0,
      transform: style?.transform || 'none',
      zoom: style?.getPropertyValue('zoom') || '1',
      rightEdgeTag: rightEdge?.tagName || null,
      horizontalScrollContainers
    }
  })

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.rootWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 1)
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(metrics.transform)
  const zoom = !metrics.zoom || metrics.zoom === 'normal' ? 1 : Number.parseFloat(metrics.zoom)
  expect(zoom).toBeCloseTo(1)
  expect(['BODY', 'HTML', null]).not.toContain(metrics.rightEdgeTag)
  expect(metrics.horizontalScrollContainers, JSON.stringify(metrics.horizontalScrollContainers, null, 2)).toEqual([])
}

async function assertResourceFixedViewport(page: import('@playwright/test').Page) {
  const collect = () => page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        scrollTop: element.scrollTop,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: style.overflowY,
        background: style.background,
        backgroundColor: style.backgroundColor,
        backdropFilter: style.backdropFilter
      }
    }
    const scrollContainers = [...document.querySelectorAll('*')]
      .filter((element) => {
        const style = getComputedStyle(element)
        return ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1
      })
      .map((element) => ({ tag: element.tagName, className: String(element.className) }))

    return {
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      page: rectOf('.resource-center-page'),
      nav: rectOf('.resource-center-page .top-nav'),
      grid: rectOf('.resource-page-grid'),
      generator: rectOf('.resource-generator-panel'),
      generateButton: rectOf('.resource-generate-button'),
      listPanel: rectOf('.resource-list-panel'),
      listScroll: rectOf('.resource-list-scroll'),
      scrollContainers
    }
  })

  const before = await collect()
  expect(before.scrollContainers, JSON.stringify(before.scrollContainers, null, 2)).toEqual([
    { tag: 'DIV', className: 'resource-list-scroll' }
  ])
  expect(before.documentHeight).toBeLessThanOrEqual(before.viewportHeight)
  expect(before.scrollY).toBe(0)
  expect(before.page?.top).toBeCloseTo(0)
  expect(before.page?.bottom).toBeLessThanOrEqual(before.viewportHeight + 1)
  expect(before.grid?.top).toBeCloseTo(before.nav?.bottom || 0)
  expect(before.generator?.bottom).toBeLessThanOrEqual(before.viewportHeight + 1)
  expect(before.generateButton?.bottom).toBeLessThanOrEqual(before.generator?.bottom || before.viewportHeight)
  expect(before.generateButton?.bottom).toBeLessThanOrEqual(before.viewportHeight + 1)
  expect(before.listPanel?.bottom).toBeLessThanOrEqual(before.viewportHeight + 1)
  expect(before.nav?.backdropFilter).toBe('none')

  const generatorBox = await page.locator('.resource-generator-panel').boundingBox()
  expect(generatorBox).not.toBeNull()
  await page.mouse.move((generatorBox?.x || 0) + 20, (generatorBox?.y || 0) + 20)
  await page.mouse.wheel(0, 540)
  await page.waitForTimeout(150)
  const afterPageWheel = await collect()
  expect(afterPageWheel.scrollY).toBe(0)
  expect(afterPageWheel.documentHeight).toBeLessThanOrEqual(afterPageWheel.viewportHeight)
  expect(afterPageWheel.nav?.background).toBe(before.nav?.background)
  expect(afterPageWheel.nav?.backgroundColor).toBe(before.nav?.backgroundColor)
  expect(afterPageWheel.nav?.top).toBe(before.nav?.top)

  const listBox = await page.locator('.resource-list-scroll').boundingBox()
  expect(listBox).not.toBeNull()
  await page.mouse.move((listBox?.x || 0) + 20, (listBox?.y || 0) + 20)
  await page.mouse.wheel(0, 540)
  await page.waitForTimeout(150)
  const afterListWheel = await collect()
  expect(afterListWheel.scrollY).toBe(0)
  expect(afterListWheel.listScroll?.scrollTop || 0).toBeGreaterThan(0)
  expect(afterListWheel.nav?.background).toBe(before.nav?.background)
  expect(afterListWheel.nav?.backgroundColor).toBe(before.nav?.backgroundColor)
  await page.locator('.resource-list-scroll').evaluate((element) => { element.scrollTop = 0 })
}

async function assertResourceDetailLayout(page: import('@playwright/test').Page) {
  await expect(page.locator('.resource-detail-hero')).toBeVisible()
  await expect(page.locator('.resource-profile-panel')).toBeVisible()
  await expect(page.locator('.resource-reference-panel')).toBeVisible()
  await expect(page.locator('.resource-quality-panel')).toBeVisible()
  await expect(page.locator('.resource-content-panel')).toBeVisible()

  const metrics = await page.evaluate(() => {
    const root = document.querySelector('.resource-detail-page') as HTMLElement | null
    const hero = document.querySelector('.resource-detail-hero') as HTMLElement | null
    const profile = document.querySelector('.resource-profile-panel') as HTMLElement | null
    const reference = document.querySelector('.resource-reference-panel') as HTMLElement | null
    const contentPanel = document.querySelector('.resource-content-panel') as HTMLElement | null
    const contentMeta = document.querySelector('.resource-content-meta') as HTMLElement | null
    const markdown = document.querySelector('.resource-markdown-body') as HTMLElement | null
    const rect = (element: HTMLElement | null) => element ? element.getBoundingClientRect().toJSON() : null
    return {
      rootBackground: root ? getComputedStyle(root).backgroundColor : '',
      heroBackground: hero ? getComputedStyle(hero).backgroundColor : '',
      rootScrollWidth: root?.scrollWidth || 0,
      rootClientWidth: root?.clientWidth || 0,
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      profile: rect(profile),
      reference: rect(reference),
      contentPanel: rect(contentPanel),
      contentMeta: rect(contentMeta),
      markdown: rect(markdown),
      metaChips: contentMeta
        ? [...contentMeta.querySelectorAll('span')].map((element) => {
            const chipRect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              text: element.textContent?.trim() || '',
              width: chipRect.width,
              height: chipRect.height,
              top: chipRect.top,
              right: chipRect.right,
              bottom: chipRect.bottom,
              writingMode: style.writingMode,
              whiteSpace: style.whiteSpace
            }
          })
        : []
    }
  })

  expect(metrics.rootBackground).toBe('rgb(246, 250, 247)')
  expect(metrics.heroBackground).not.toBe('rgb(8, 28, 45)')
  expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth + 1)
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.profile).not.toBeNull()
  expect(metrics.reference).not.toBeNull()
  expect(metrics.profile?.right || 0).toBeLessThanOrEqual((metrics.reference?.left || 0) + 1)
  expect(metrics.contentMeta).not.toBeNull()
  expect(metrics.metaChips.length).toBeGreaterThan(0)
  expect(metrics.metaChips.every((chip) => chip.writingMode === 'horizontal-tb')).toBeTruthy()
  expect(metrics.metaChips.every((chip) => chip.width > chip.height)).toBeTruthy()
  expect(metrics.metaChips.every((chip) => chip.height <= 64)).toBeTruthy()
  expect(metrics.metaChips.every((chip) => chip.right <= (metrics.contentPanel?.right || 0) - 20)).toBeTruthy()
  expect(metrics.contentMeta?.bottom || 0).toBeLessThanOrEqual((metrics.markdown?.top || 0) + 1)
}

async function assertResourceDetailDataTruth(page: import('@playwright/test').Page, resource: ResourceDetailPayload) {
  if (!resource.profile_snapshot) {
    await expect(page.getByText('本资源生成时未使用学习画像，以下画像信息均未记录。')).toBeVisible()
  } else {
    const profileValues = [
      resource.profile_snapshot.learning_goal,
      resource.profile_snapshot.course,
      resource.profile_snapshot.learning_preferences
    ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    for (const value of profileValues) {
      await expect(page.getByText(value, { exact: false }).first()).toBeVisible()
    }
  }

  if (!resource.reference_snapshot?.length) {
    await expect(page.getByText('本次生成没有可用的知识库证据。')).toBeVisible()
  } else {
    for (const reference of resource.reference_snapshot) {
      if (reference.source_filename) await expect(page.getByText(reference.source_filename, { exact: false }).first()).toBeVisible()
    }
  }

  if (!resource.quality_analysis) {
    await expect(page.getByText('本次生成未提供质量分析数据，无法展示覆盖率、匹配度或可信度。')).toBeVisible()
  }
}
