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

const FORBIDDEN_ENDPOINTS = [
  '/api/training-program/extract-skills',
  '/api/training-program/generate-plan',
  '/api/training-program/save',
  '/api/training-program/my-plans',
  '/api/training-plan/generate',
  '/api/generate/training-program',
  '/api/teacher/training-program',
  'localhost:3000',
  'localhost:5000',
  'localhost:8080'
]

test.beforeEach(async ({ page }) => {
  await loginViaUI(page, accounts.teacher)
})

test('external training program page generates without files or knowledge base', async ({ page }) => {
  test.setTimeout(160_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []

  page.on('request', (request) => {
    const url = request.url()
    if (FORBIDDEN_ENDPOINTS.some((endpoint) => url.includes(endpoint))) {
      forbiddenRequests.push(url)
    }
  })

  await gotoApp(page, '/teacher/training-plans')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-training-program')).toBeVisible()
  await expect(page.getByTestId('external-teacher-training-plans')).toHaveCount(0)
  await expect(page.locator('.teacher-generation-page')).toHaveCount(0)
  await expect(page.getByTestId('external-teacher-training-program-host')).toBeVisible()
  await expect(page.getByTestId('external-teacher-training-program')).not.toContainText(/接口未实现|mock|fallback|后端暂无能力|后端暂未/i)

  const layoutMetrics = await page.getByTestId('external-teacher-training-program-host').evaluate((host) => {
    const shadowRoot = host.shadowRoot
    const externalLayout = document.querySelector('.external-full-page-layout') as HTMLElement | null
    const pageEl = shadowRoot?.querySelector('.teacher-workbench-page') as HTMLElement | null
    const nav = shadowRoot?.querySelector('.top-nav') as HTMLElement | null
    const title = shadowRoot?.querySelector('.workbench-hero h1') as HTMLElement | null
    const layout = shadowRoot?.querySelector('.workbench-layout') as HTMLElement | null
    const formPanel = shadowRoot?.querySelector('.workbench-panel--form') as HTMLElement | null
    const skillsPanel = shadowRoot?.querySelector('[data-testid="external-teacher-training-skills"]') as HTMLElement | null
    const planPanel = shadowRoot?.querySelector('[data-testid="external-teacher-training-plan-result"]') as HTMLElement | null
    const background = shadowRoot?.querySelector('.resource-prism-background') as HTMLElement | null
    const exerciseBackground = shadowRoot?.querySelector('.exercise-prism-background')
    const activeButton = shadowRoot?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    const rightEdgeElement = document.elementFromPoint(window.innerWidth - 2, Math.floor(window.innerHeight / 2)) as HTMLElement | null
    if (!shadowRoot || !pageEl) {
      return { hasShadow: false }
    }
    const style = getComputedStyle(pageEl)
    const navStyle = nav ? getComputedStyle(nav) : null
    const navRect = nav?.getBoundingClientRect()
    const titleRect = title?.getBoundingClientRect()
    const layoutRect = layout?.getBoundingClientRect()
    const formRect = formPanel?.getBoundingClientRect()
    const skillsRect = skillsPanel?.getBoundingClientRect()
    const planRect = planPanel?.getBoundingClientRect()
    const backgroundStyle = background ? getComputedStyle(background) : null
    const externalLayoutStyle = externalLayout ? getComputedStyle(externalLayout) : null
    const rightEdgeStyle = rightEdgeElement ? getComputedStyle(rightEdgeElement) : null
    const decoration = getComputedStyle(pageEl, '::after')
    const columns = layout
      ? getComputedStyle(layout)
          .gridTemplateColumns.split(' ')
          .map((value) => Number.parseFloat(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      : []
    return {
      hasShadow: true,
      transform: style.transform,
      inlineZoom: pageEl.style.getPropertyValue('zoom'),
      documentOverflowOk: document.documentElement.scrollWidth <= window.innerWidth + 8,
      bodyOverflowOk: document.body.scrollWidth <= window.innerWidth + 8,
      externalLayoutClassName: externalLayout?.className || '',
      externalLayoutBackground: externalLayoutStyle?.backgroundColor || '',
      externalLayoutOverflowX: externalLayoutStyle?.overflowX || '',
      externalLayoutScrollbarGutter: externalLayoutStyle?.scrollbarGutter || '',
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      rightEdgeTag: rightEdgeElement?.tagName || null,
      rightEdgeClassName: String(rightEdgeElement?.className || ''),
      rightEdgeBackground: rightEdgeStyle?.backgroundColor || '',
      topNavCount: shadowRoot.querySelectorAll('.top-nav').length,
      topNavHeight: navRect?.height ?? 0,
      topNavZIndex: navStyle?.zIndex || '',
      topNavColumns: navStyle?.gridTemplateColumns || '',
      topNavColumnGap: navStyle?.columnGap || '',
      topNavPaddingLeft: navStyle?.paddingLeft || '',
      brandStrongText: nav?.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: nav?.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      navButtonsText: [...(nav?.querySelectorAll('.top-nav-button') ?? [])].map((button) => button.textContent?.trim() || ''),
      navMarkDisplay: nav ? getComputedStyle(nav.querySelector('.top-nav-mark') as HTMLElement).display : '',
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || '',
      overflowOk: pageEl.scrollWidth <= pageEl.clientWidth + 8,
      titleGapFromNav: titleRect && navRect ? titleRect.top - navRect.bottom : 999,
      layoutTop: layoutRect?.top ?? 999,
      formTop: formRect?.top ?? 999,
      skillsTop: skillsRect?.top ?? 999,
      planTop: planRect?.top ?? 999,
      formVisibleHeight: formRect ? Math.min(window.innerHeight, formRect.bottom) - Math.max(0, formRect.top) : 0,
      skillsVisibleHeight: skillsRect ? Math.min(window.innerHeight, skillsRect.bottom) - Math.max(0, skillsRect.top) : 0,
      planVisibleHeight: planRect ? Math.min(window.innerHeight, planRect.bottom) - Math.max(0, planRect.top) : 0,
      columnCount: columns.length,
      columnRatio: columns.length >= 2 ? columns[0] / columns[1] : 0,
      hasResourceBackground: Boolean(background),
      hasExerciseBackground: Boolean(exerciseBackground),
      backgroundCanvasCount: background?.querySelectorAll('canvas').length ?? 0,
      backgroundOpacity: backgroundStyle?.opacity ?? '',
      backgroundMask: backgroundStyle?.maskImage || backgroundStyle?.webkitMaskImage || '',
      decorationContent: decoration.content,
      decorationWidth: Number.parseFloat(decoration.width)
    }
  })
  expect(layoutMetrics.hasShadow).toBeTruthy()
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(layoutMetrics.transform)
  expect(layoutMetrics.inlineZoom).toBe('')
  expect(layoutMetrics.documentOverflowOk).toBeTruthy()
  expect(layoutMetrics.bodyOverflowOk).toBeTruthy()
  expect(layoutMetrics.externalLayoutClassName).toContain('external-full-page-layout--teacher-training-program')
  expect(layoutMetrics.externalLayoutBackground).toBe('rgb(245, 242, 234)')
  expect(['clip', 'hidden']).toContain(layoutMetrics.externalLayoutOverflowX)
  expect(layoutMetrics.externalLayoutScrollbarGutter).toBe('auto')
  expect(layoutMetrics.bodyBackground).toBe('rgb(245, 242, 234)')
  expect(layoutMetrics.rightEdgeBackground).not.toBe('rgb(2, 6, 23)')
  expect(['BODY', 'HTML', null]).not.toContain(layoutMetrics.rightEdgeTag)
  expect(layoutMetrics.topNavCount).toBe(1)
  expect(layoutMetrics.topNavHeight).toBe(72)
  expect(layoutMetrics.topNavZIndex).toBe('60')
  expect(layoutMetrics.topNavColumns.split(' ').length).toBe(3)
  expect(layoutMetrics.topNavColumnGap).not.toBe('18px')
  expect(layoutMetrics.topNavPaddingLeft).not.toBe('76px')
  expect(layoutMetrics.brandStrongText).toBe('核镜智教')
  expect(layoutMetrics.brandEmText).toBe('Prism Mind')
  expect(layoutMetrics.navButtonsText).toEqual(['首页', '返回', '用户', '退出'])
  expect(layoutMetrics.navMarkDisplay).toBe('none')
  expect(layoutMetrics.activeUnderlineOpacity).toBe('0.72')
  expect(layoutMetrics.activeUnderlineHeight).toBe('1px')
  expect(layoutMetrics.activeDotOpacity).toBe('0.5')
  expect(layoutMetrics.activeDotWidth).toBe('5px')
  expect(layoutMetrics.activeDotHeight).toBe('5px')
  expect(layoutMetrics.overflowOk).toBeTruthy()
  expect(layoutMetrics.titleGapFromNav).toBeGreaterThanOrEqual(8)
  expect(layoutMetrics.titleGapFromNav).toBeLessThanOrEqual(40)
  expect(layoutMetrics.layoutTop).toBeLessThan(240)
  expect(layoutMetrics.formTop).toBeLessThan(270)
  expect(layoutMetrics.skillsTop).toBeLessThan(270)
  expect(layoutMetrics.planTop).toBeLessThan(620)
  expect(layoutMetrics.formVisibleHeight).toBeGreaterThan(420)
  expect(layoutMetrics.skillsVisibleHeight).toBeGreaterThan(130)
  expect(layoutMetrics.planVisibleHeight).toBeGreaterThan(240)
  expect(layoutMetrics.columnCount).toBe(2)
  expect(layoutMetrics.columnRatio).toBeGreaterThan(1.05)
  expect(layoutMetrics.columnRatio).toBeLessThan(1.22)
  expect(layoutMetrics.hasResourceBackground).toBeTruthy()
  expect(layoutMetrics.hasExerciseBackground).toBeFalsy()
  expect(layoutMetrics.backgroundCanvasCount).toBeGreaterThanOrEqual(1)
  expect(Number(layoutMetrics.backgroundOpacity)).toBeGreaterThan(0.1)
  expect(layoutMetrics.backgroundMask).not.toBe('none')
  expect(layoutMetrics.decorationContent).not.toBe('none')
  expect(layoutMetrics.decorationWidth).toBeGreaterThan(320)

  await page.getByRole('button', { name: '用户' }).click()
  await expect(page.locator('.top-user-popover')).toBeVisible()
  await expect(page.locator('.top-user-popover')).toContainText('Prism Mind')
  await expect(page.locator('.top-user-popover')).toContainText('Training program console')
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)

  const suffix = Date.now()
  await page.locator('#trainingProgramName').fill(`E2E 智能教育培养方案 ${suffix}`)
  await page.locator('#trainingEducationLevel').fill('本科')
  await page.locator('#trainingMajorName').fill('智能科学与技术')
  await expect(page.locator('#trainingFocusPrompt')).toHaveValue('')
  await expect(page.locator('.training-file-native-input')).toHaveValue('')

  const extractRequest = page.waitForRequest((request) =>
    request.url().includes('/api/v1/teacher/training-plans/extract-skills') && request.method() === 'POST'
  )
  const extractResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/training-plans/extract-skills') && response.request().method() === 'POST'
  )
  const generateResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/training-plans/generate') && response.request().method() === 'POST'
  )

  await page.locator(`[data-testid="external-teacher-training-program"] .primary-action`).first().click()
  const preparationProgress = page
    .locator(
      '[data-testid="training-program-generation-progress"], [data-testid="teacher-task-progress"]',
    )
    .first()
  await expect(preparationProgress).toBeVisible()
  await expect(preparationProgress.getByRole('progressbar')).toBeVisible()
  await expect(preparationProgress).toContainText(/提取|生成|%/)
  const extractionPayload = (await extractRequest).postDataJSON()
  expect(extractionPayload.file_ids).toEqual([])
  expect(extractionPayload.knowledge_document_ids).toBeNull()
  expect(extractionPayload.use_knowledge_base).toBeFalsy()
  expect(extractionPayload.focus_prompt).toContain('智能科学与技术')
  await expect((await extractResponse).ok()).toBeTruthy()
  await expect((await generateResponse).ok()).toBeTruthy()

  await expect(page.getByTestId('external-teacher-training-skills')).toContainText('核心技能', { timeout: 60_000 })
  const taskProgress = page.getByTestId('teacher-task-progress')
  await expect(taskProgress).toBeVisible({ timeout: 20_000 })
  await expect(taskProgress).toContainText('100%', { timeout: 180_000 })
  await expect(taskProgress.locator('.task-partial-content')).not.toBeEmpty()
  await expect(taskProgress.getByRole('link', { name: '查看生成资源详情' })).toHaveAttribute('href', /\/teacher\/generated-artifacts\/\d+$/)
  await expect(page.getByTestId('external-teacher-training-program')).not.toContainText(/接口未实现|mock|fallback|后端暂无能力|后端暂未/i)

  const historyResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/teacher/generated-artifacts') &&
    response.url().includes('artifact_type=training_plan') &&
    response.request().method() === 'GET'
  )
  await page.getByRole('button', { name: '管理方案' }).click()
  await expect((await historyResponse).ok()).toBeTruthy()
  await expect(page.getByTestId('external-teacher-training-history')).toBeVisible()

  await saveScreenshot(page, 'teacher-training-program-after-restore-1920')

  expect(forbiddenRequests, forbiddenRequests.join('\n')).toEqual([])
  expectNoPageIssues(issues)
})
