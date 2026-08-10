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
      description: 'Playwright 创建的教师端我的课程回归课程。'
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

async function collectTeacherCardStageMetrics(page: Page) {
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
    const cards = [...document.querySelectorAll('[data-card="teacher-course"], .lesson-prism-card')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => {
        const style = window.getComputedStyle(element)
        return {
          zIndex: Number.parseInt(style.zIndex || '0', 10) || 0,
          opacity: Number.parseFloat(style.opacity || '1'),
          translateZ: parseTranslateZ(style.transform),
          text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) || ''
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

async function collectTeacherTopNavSignature(page: Page) {
  return page.locator('.teacher-courses-page .top-nav').evaluate((element) => {
    const navRect = element.getBoundingClientRect()
    const navStyle = getComputedStyle(element)
    const activeButton = element.querySelector('.top-nav-left .top-nav-button.is-active')
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    const topNavMark = element.querySelector('.top-nav-mark')
    return {
      navTop: Math.round(navRect.top),
      navHeight: Math.round(navRect.height),
      display: navStyle.display,
      gridTemplateColumns: navStyle.gridTemplateColumns,
      columnGap: navStyle.columnGap,
      paddingLeft: navStyle.paddingLeft,
      paddingRight: navStyle.paddingRight,
      topNavMarkDisplay: topNavMark ? getComputedStyle(topNavMark).display : '',
      brandStrongText: element.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: element.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      buttonsText: [...element.querySelectorAll('.top-nav-button')].map((button) => button.textContent?.trim() || ''),
      buttonsLayout: [...element.querySelectorAll('.top-nav-button')].map((button) => {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        return {
          text: button.textContent?.trim() || '',
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          height: Math.round(rect.height),
          whiteSpace: style.whiteSpace,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight
        }
      }),
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || ''
    }
  })
}

async function collectTeacherLayoutPositions(page: Page) {
  return page.evaluate(() => {
    const pick = (name: string, selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        name,
        selector,
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        marginTop: style.marginTop,
        paddingTop: style.paddingTop,
        background: style.background,
        borderRadius: style.borderRadius,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        display: style.display,
        position: style.position,
        transform: style.transform,
        zoom: style.getPropertyValue('zoom') || '1'
      }
    }

    return {
      viewportWidth: window.innerWidth,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      root: pick('root', '.teacher-courses-page'),
      header: pick('header', '.teacher-courses-page .top-nav'),
      hero: pick('hero', '.teacher-courses-page .page-hero'),
      toolbar: pick('toolbar', '.teacher-courses-page .toolbar-row'),
      stage: pick('stage', '.teacher-courses-page .lesson-scene-layer'),
      stats: pick('stats', '.teacher-courses-page .stats-panel'),
      detail: pick('detail', '.teacher-courses-page .lesson-detail-panel')
    }
  })
}

async function selectCourseCard(page: Page, courseName: string) {
  const card = page.locator('[data-course-id]').filter({ hasText: courseName }).first()
  await expect(card).toBeVisible({ timeout: 20_000 })
  const detailResponse = page
    .waitForResponse(
      (response) => /\/api\/v1\/courses\/\d+($|\?)/.test(response.url()) && response.request().method() === 'GET',
      { timeout: 10_000 }
    )
    .catch(() => null)
  await card.focus()
  await card.press('Enter')
  await detailResponse
  const detailPanel = page.locator('.lesson-detail-panel').filter({ hasText: courseName })
  if (!(await detailPanel.isVisible().catch(() => false))) {
    await card.evaluate((element) => (element as HTMLElement).click())
  }
  await expect(detailPanel).toBeVisible({ timeout: 20_000 })
  return card
}

test('teacher courses uses external mine my_lessons page with real teacher course APIs', async ({ page, request }) => {
  test.setTimeout(240_000)
  const issues = collectPageIssues(page)
  const forbiddenRequests: string[] = []
  const apiHits = {
    list: 0,
    detail: 0,
    assignments: 0,
    create: 0,
    archive: 0
  }

  page.on('request', (apiRequest) => {
    const url = apiRequest.url()
    const parsedUrl = new URL(url)
    const path = parsedUrl.pathname
    if (
      path.startsWith('/api/courses') ||
      path.startsWith('/api/teacher') ||
      path.startsWith('/api/student') ||
      path.startsWith('/api/user') ||
      path.startsWith('/api/me') ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:3000' ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:5000' ||
      `${parsedUrl.hostname}:${parsedUrl.port}` === 'localhost:8080'
    ) {
      forbiddenRequests.push(url)
    }
    if (url.includes('/api/v1/courses/my')) apiHits.list += 1
    if (/\/api\/v1\/courses\/\d+($|\?)/.test(url) && apiRequest.method() === 'GET') apiHits.detail += 1
    if (/\/api\/v1\/courses\/\d+\/assignments($|\?)/.test(url)) apiHits.assignments += 1
    if (/\/api\/v1\/courses($|\?)/.test(url) && apiRequest.method() === 'POST') apiHits.create += 1
    if (/\/api\/v1\/courses\/\d+\/archive($|\?)/.test(url) && apiRequest.method() === 'POST') apiHits.archive += 1
  })

  const suffix = Date.now()
  const prefix = `E2E 教师课程 ${suffix}`
  const teacherToken = await loginViaApi(request, accounts.teacher)
  const primaryCourse = await createCourseByApi(request, teacherToken, `${prefix} A`)
  await createCourseByApi(request, teacherToken, `${prefix} B`)

  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/teacher/courses')

  await expect(page).toHaveURL(/\/teacher\/courses$/)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-courses')).toBeVisible()
  await expect(page.locator('.mine-lessons-page.teacher-courses-page')).toBeVisible()
  await expect(page.locator('.main-layout__content')).toHaveCount(0)
  await expect(page.locator('.main-layout__aside')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await expect(page.getByTestId('external-loading')).toHaveCount(0, { timeout: 20_000 })

  const topNav = page.locator('.teacher-courses-page .top-nav')
  await expect(topNav).toHaveCount(1)
  await expect(topNav.locator('.top-brand-name strong')).toHaveText('棱镜智教')
  await expect(topNav.locator('.top-brand-name em')).toHaveText('PrismMind')
  await expect(topNav.locator('.top-nav-left .top-nav-button')).toHaveText(['首页', '返回'])
  await expect(topNav.locator('.top-nav-right .top-nav-button')).toHaveText(['用户', '退出'])
  await expect(topNav.locator('.top-nav-left .top-nav-button').first()).toHaveClass(/is-active/)
  const topNavSignature = await collectTeacherTopNavSignature(page)
  expect(topNavSignature).toMatchObject({
    navTop: 0,
    display: 'grid',
    topNavMarkDisplay: 'none',
    brandStrongText: '棱镜智教',
    brandEmText: 'PrismMind',
    buttonsText: ['首页', '返回', '用户', '退出'],
    activeUnderlineOpacity: '0.72',
    activeUnderlineHeight: '1px',
    activeDotOpacity: '0.5',
    activeDotWidth: '5px',
    activeDotHeight: '5px'
  })
  expect(topNavSignature.navHeight).toBeGreaterThanOrEqual(70)
  expect(topNavSignature.navHeight).toBeLessThanOrEqual(74)
  expect(topNavSignature.gridTemplateColumns.split(' ').filter(Boolean)).toHaveLength(3)
  expect(topNavSignature.buttonsLayout).toHaveLength(4)
  const navButtonTops = topNavSignature.buttonsLayout.map((button) => button.top)
  expect(Math.max(...navButtonTops) - Math.min(...navButtonTops)).toBeLessThanOrEqual(6)
  expect(topNavSignature.buttonsLayout.map((button) => button.text)).toEqual(['首页', '返回', '用户', '退出'])
  expect(topNavSignature.buttonsLayout.every((button) => button.whiteSpace === 'nowrap')).toBeTruthy()

  const layoutPositions = await collectTeacherLayoutPositions(page)
  expect(layoutPositions.documentWidth).toBeLessThanOrEqual(layoutPositions.viewportWidth + 1)
  expect(layoutPositions.root?.transform).toBe('none')
  const rootZoom = !layoutPositions.root?.zoom || layoutPositions.root.zoom === 'normal' ? 1 : Number.parseFloat(layoutPositions.root.zoom)
  expect(rootZoom).toBeCloseTo(1)
  expect(layoutPositions.hero?.paddingTop).toBe('28px')
  expect(layoutPositions.hero?.height).toBeGreaterThanOrEqual(170)
  expect(layoutPositions.hero?.background).not.toBe('rgba(0, 0, 0, 0) none repeat scroll 0% 0% / auto padding-box border-box')
  expect(layoutPositions.hero?.borderRadius).toBe('8px')
  expect(layoutPositions.hero?.borderTopWidth).toBe('1px')
  expect(layoutPositions.hero?.boxShadow).not.toBe('none')
  expect(layoutPositions.hero?.top).toBeLessThanOrEqual(140)
  expect(layoutPositions.toolbar?.top).toBeLessThanOrEqual(310)
  expect(layoutPositions.stage?.top).toBeLessThanOrEqual(420)
  expect(layoutPositions.stats?.top).toBeLessThanOrEqual(140)
  expect(layoutPositions.detail?.top).toBeLessThanOrEqual(260)
  expect((layoutPositions.stage?.top || 0) - (layoutPositions.hero?.bottom || 0)).toBeGreaterThanOrEqual(0)
  expect((layoutPositions.stage?.top || 0) - (layoutPositions.hero?.bottom || 0)).toBeLessThanOrEqual(24)

  const heroCard = page.locator('.teacher-courses-page .page-hero')
  await expect(heroCard).toBeVisible()
  await expect(heroCard.getByRole('heading', { name: '我的课程' })).toBeVisible()
  await expect(heroCard.locator('.search-box input')).toBeVisible()
  await expect(heroCard.locator('.join-code-box input')).toBeVisible()
  await expect(heroCard.getByRole('button', { name: '创建课程' })).toBeVisible()
  await expect(heroCard.getByRole('button', { name: '刷新' })).toBeVisible()
  await expect(page.locator('.stats-panel')).toBeVisible()
  await expect(page.locator('.lesson-detail-panel')).toBeVisible()

  await page.locator('.search-box input').fill('不会命中的教师课程关键词')
  await expect(page.getByText('没有匹配的课程，请调整关键词或清空搜索。')).toBeVisible({ timeout: 20_000 })
  await page.locator('.search-box input').fill(prefix)

  const primaryCard = page.locator('[data-course-id]').filter({ hasText: primaryCourse.name }).first()
  await expect(primaryCard).toBeVisible({ timeout: 20_000 })

  const cardStageBeforeWheel = await collectTeacherCardStageMetrics(page)
  expect(cardStageBeforeWheel.count).toBeGreaterThan(1)
  expect(cardStageBeforeWheel.sceneOverflowX).toBe('hidden')
  expect(cardStageBeforeWheel.sceneOverflowY).toBe('hidden')
  expect(cardStageBeforeWheel.scenePerspective).toBe('1200px')
  expect(cardStageBeforeWheel.stageTransformStyle).toBe('preserve-3d')
  expect(cardStageBeforeWheel.frontZIndex).toBeGreaterThan(cardStageBeforeWheel.secondZIndex)
  expect(cardStageBeforeWheel.frontTranslateZ).toBeGreaterThanOrEqual(cardStageBeforeWheel.secondTranslateZ)
  expect(cardStageBeforeWheel.maxDepthZIndex).toBe(cardStageBeforeWheel.frontZIndex)
  expect(cardStageBeforeWheel.frontOpacity).toBeGreaterThanOrEqual(cardStageBeforeWheel.secondOpacity)
  expect(cardStageBeforeWheel.cardPartsBackfaceHidden).toBeTruthy()
  expect(cardStageBeforeWheel.documentWidth).toBeLessThanOrEqual(cardStageBeforeWheel.viewportWidth + 1)

  await page.locator('.lesson-card-system').hover()
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, 260)
  }
  await page.waitForTimeout(1_200)
  const cardStageAfterWheel = await collectTeacherCardStageMetrics(page)
  expect(cardStageAfterWheel.frontZIndex).toBeGreaterThan(cardStageAfterWheel.secondZIndex)
  expect(cardStageAfterWheel.frontTranslateZ).toBeGreaterThanOrEqual(cardStageAfterWheel.secondTranslateZ)
  expect(cardStageAfterWheel.maxDepthZIndex).toBe(cardStageAfterWheel.frontZIndex)
  expect(cardStageAfterWheel.documentWidth).toBeLessThanOrEqual(cardStageAfterWheel.viewportWidth + 1)

  await page.locator('.search-box input').fill(primaryCourse.name)
  await selectCourseCard(page, primaryCourse.name)
  await expect(page.locator('.lesson-detail-panel').filter({ hasText: 'Playwright 创建的教师端我的课程回归课程。' })).toBeVisible({
    timeout: 20_000
  })
  await expect(page.locator('.lesson-detail-panel').filter({ hasText: '任务发布' })).toBeVisible()
  await expect(page.locator('.lesson-detail-panel').filter({ hasText: '学生提交' })).toBeVisible()
  await expect(page.locator('.lesson-detail-panel').getByRole('button', { name: '进入管理' })).toBeVisible()
  await expect(page.locator('.lesson-detail-panel').getByRole('button', { name: '归档课程' })).toBeVisible()

  await page.locator('.search-box input').fill('')
  const uiCourseName = `${prefix} UI创建`
  await page.locator('.join-code-box input').fill(uiCourseName)
  const createResponse = page.waitForResponse(
    (response) => /\/api\/v1\/courses($|\?)/.test(response.url()) && response.request().method() === 'POST'
  )
  await page.locator('.toolbar-row .add-button').first().click()
  await expect((await createResponse).ok()).toBeTruthy()
  await expect(page.locator('.lesson-action-notice.is-success').filter({ hasText: '课程已创建' }).first()).toBeVisible({
    timeout: 20_000
  })
  await expect(page.locator('[data-course-id]').filter({ hasText: uiCourseName }).first()).toBeVisible({ timeout: 20_000 })

  const refreshResponse = page.waitForResponse(
    (response) => response.url().includes('/api/v1/courses/my') && response.request().method() === 'GET'
  )
  await page.locator('.toolbar-row .add-button--subtle').click()
  await expect((await refreshResponse).ok()).toBeTruthy()

  await page.locator('.search-box input').fill(uiCourseName)
  await selectCourseCard(page, uiCourseName)
  const archiveButton = page.locator('.lesson-detail-panel').getByRole('button', { name: '归档课程' })
  await expect(archiveButton).toBeEnabled({ timeout: 20_000 })
  const archiveResponse = page.waitForResponse(
    (response) => /\/api\/v1\/courses\/\d+\/archive($|\?)/.test(response.url()) && response.request().method() === 'POST'
  )
  await archiveButton.click()
  await expect((await archiveResponse).ok()).toBeTruthy()
  await expect(page.locator('.lesson-action-notice.is-success').filter({ hasText: '课程已归档' }).first()).toBeVisible({
    timeout: 20_000
  })

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(/ApiAdapter|fallback|mock|\/api\/v1|\/api\/courses|课程接口|后端暂无能力|加入课程|进入学习/)
  await expect(page.locator('[data-card="student-course"]')).toHaveCount(0)
  await saveScreenshot(page, 'teacher-courses')

  await page.locator('.lesson-detail-panel .primary-action').click()
  await expect(page).toHaveURL(new RegExp(`/teacher/courses/\\d+$`), { timeout: 20_000 })
  await expect(page).not.toHaveURL(/\/student\/courses/)
  await gotoApp(page, '/teacher/courses')
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await expect(page).toHaveURL(/\/teacher\/dashboard$/, { timeout: 20_000 })

  await gotoApp(page, '/teacher/courses')
  await page.evaluate(() => {
    window.localStorage.setItem('access_token', 'demo-access')
    window.localStorage.setItem('refresh_token', 'demo-refresh')
    window.localStorage.setItem('user_info', 'demo-user')
    window.localStorage.setItem('teacher_user_info', 'demo-teacher-user')
    window.localStorage.setItem('prismmind_extra_token', 'demo-prism')
    window.localStorage.setItem('edugenie_extra_token', 'demo-edu')
    window.sessionStorage.setItem('edugenie_session_token', 'demo-session')
  })
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 })
  const remainingSessionKeys = await page.evaluate(() =>
    [
      'access_token',
      'refresh_token',
      'user_info',
      'teacher_user_info',
      'prismmind_extra_token',
      'edugenie_extra_token',
      'edugenie_session_token'
    ].filter((key) => window.localStorage.getItem(key) || window.sessionStorage.getItem(key))
  )
  expect(remainingSessionKeys).toEqual([])

  expect(apiHits.list).toBeGreaterThan(0)
  expect(apiHits.detail).toBeGreaterThan(0)
  expect(apiHits.assignments).toBeGreaterThan(0)
  expect(apiHits.create).toBeGreaterThan(0)
  expect(apiHits.archive).toBeGreaterThan(0)
  expect(forbiddenRequests).toEqual([])
  expectNoPageIssues(issues)
})
