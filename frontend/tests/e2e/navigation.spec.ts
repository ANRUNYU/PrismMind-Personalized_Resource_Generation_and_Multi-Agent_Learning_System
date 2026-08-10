import { expect, test, type Page } from '@playwright/test'

import {
  accounts,
  collectPageIssues,
  expectExternalFullPage,
  expectLegacyMainLayout,
  gotoAuthLoading,
  expectNoPageIssues,
  gotoApp,
  loginViaUI,
  logoutViaUI
} from './helpers'

async function collectStudentTopNavSignature(page: Page, selector: string) {
  const topNav = page.locator(selector)
  await expect(topNav).toHaveCount(1)

  return topNav.evaluate((element) => {
    const readElement = (target: Element | null) => {
      if (!target) return null
      const htmlElement = target as HTMLElement
      const style = window.getComputedStyle(htmlElement)
      const rect = htmlElement.getBoundingClientRect()
      return {
        text: htmlElement.textContent?.trim() || '',
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        color: style.color,
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    }
    const navStyle = window.getComputedStyle(element)
    const navRect = element.getBoundingClientRect()
    const activeButton = element.querySelector('.top-nav-left .top-nav-button.is-active')
    const activeUnderline = activeButton ? window.getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? window.getComputedStyle(activeButton, '::after') : null

    return {
      nav: {
        height: Math.round(navRect.height),
        gridTemplateColumns: navStyle.gridTemplateColumns,
        columnGap: navStyle.columnGap,
        paddingLeft: navStyle.paddingLeft,
        paddingRight: navStyle.paddingRight,
        backgroundColor: navStyle.backgroundColor,
        borderBottomColor: navStyle.borderBottomColor,
        boxShadow: navStyle.boxShadow,
        backdropFilter: navStyle.backdropFilter || navStyle.getPropertyValue('-webkit-backdrop-filter')
      },
      brandStrong: readElement(element.querySelector('.top-brand-name strong')),
      brandEm: readElement(element.querySelector('.top-brand-name em')),
      buttons: [...element.querySelectorAll('.top-nav-button')].map((button) => readElement(button)),
      activeUnderline: activeUnderline
        ? {
            opacity: activeUnderline.opacity,
            height: activeUnderline.height,
            transform: activeUnderline.transform,
            backgroundColor: activeUnderline.backgroundColor
          }
        : null,
      activeDot: activeDot
        ? {
            opacity: activeDot.opacity,
            width: activeDot.width,
            height: activeDot.height,
            borderRadius: activeDot.borderRadius
          }
        : null
    }
  })
}

async function collectTeacherCoursesTopNavSignature(page: Page) {
  const topNav = page.locator('.teacher-courses-page .top-nav')
  await expect(topNav).toHaveCount(1)

  return topNav.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const topNavMark = element.querySelector('.top-nav-mark')
    const buttons = [...element.querySelectorAll('.top-nav-button')].map((button) => {
      const buttonRect = button.getBoundingClientRect()
      const buttonStyle = getComputedStyle(button)
      return {
        text: button.textContent?.trim() || '',
        top: Math.round(buttonRect.top),
        left: Math.round(buttonRect.left),
        height: Math.round(buttonRect.height),
        whiteSpace: buttonStyle.whiteSpace,
        fontSize: buttonStyle.fontSize,
        fontWeight: buttonStyle.fontWeight
      }
    })

    return {
      count: document.querySelectorAll('.teacher-courses-page .top-nav').length,
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      display: style.display,
      gridTemplateColumns: style.gridTemplateColumns,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      topNavMarkDisplay: topNavMark ? getComputedStyle(topNavMark).display : '',
      brandStrongText: element.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: element.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      buttons
    }
  })
}

test('sidebar navigation, refresh, and 404 page remain stable', async ({ page }) => {
  const issues = collectPageIssues(page)

  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/teacher/courses')
  await expect(page).toHaveURL(/\/teacher\/courses$/)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-courses')).toBeVisible()
  await expect(page.locator('.main-layout__content')).toHaveCount(0)
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  const teacherCoursesTopNav = await collectTeacherCoursesTopNavSignature(page)
  expect(teacherCoursesTopNav).toMatchObject({
    count: 1,
    top: 0,
    display: 'grid',
    topNavMarkDisplay: 'none',
    brandStrongText: '棱镜智教',
    brandEmText: 'PrismMind'
  })
  expect(teacherCoursesTopNav.height).toBeGreaterThanOrEqual(70)
  expect(teacherCoursesTopNav.height).toBeLessThanOrEqual(74)
  expect(teacherCoursesTopNav.gridTemplateColumns.split(' ').filter(Boolean)).toHaveLength(3)
  expect(teacherCoursesTopNav.buttons.map((button) => button.text)).toEqual(['首页', '返回', '用户', '退出'])
  const teacherCoursesButtonTops = teacherCoursesTopNav.buttons.map((button) => button.top)
  expect(Math.max(...teacherCoursesButtonTops) - Math.min(...teacherCoursesButtonTops)).toBeLessThanOrEqual(6)
  expect(teacherCoursesTopNav.buttons.every((button) => button.whiteSpace === 'nowrap')).toBeTruthy()

  await gotoApp(page, '/teacher/course-designs')
  await expect(page).toHaveURL(/\/teacher\/course-designs$/)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-curriculum-design')).toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/teacher\/course-designs$/)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-curriculum-design')).toBeVisible()

  await gotoApp(page, '/teacher/training-plans')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-training-program')).toBeVisible()
  const teacherTrainingTopNav = await page.getByTestId('external-teacher-training-program-host').evaluate((host) => {
    const shadowRoot = host.shadowRoot
    const topNav = shadowRoot?.querySelector('.top-nav') as HTMLElement | null
    const activeButton = shadowRoot?.querySelector('.top-nav-left .top-nav-button.is-active') as HTMLElement | null
    const activeUnderline = activeButton ? getComputedStyle(activeButton, '::before') : null
    const activeDot = activeButton ? getComputedStyle(activeButton, '::after') : null
    return {
      count: shadowRoot?.querySelectorAll('.top-nav').length ?? 0,
      brandStrongText: topNav?.querySelector('.top-brand-name strong')?.textContent?.trim() || '',
      brandEmText: topNav?.querySelector('.top-brand-name em')?.textContent?.trim() || '',
      buttonsText: [...(topNav?.querySelectorAll('.top-nav-button') ?? [])].map((button) => button.textContent?.trim() || ''),
      activeUnderlineOpacity: activeUnderline?.opacity || '',
      activeUnderlineHeight: activeUnderline?.height || '',
      activeDotOpacity: activeDot?.opacity || '',
      activeDotWidth: activeDot?.width || '',
      activeDotHeight: activeDot?.height || ''
    }
  })
  expect(teacherTrainingTopNav).toEqual({
    count: 1,
    brandStrongText: '核镜智教',
    brandEmText: 'Prism Mind',
    buttonsText: ['首页', '返回', '用户', '退出'],
    activeUnderlineOpacity: '0.72',
    activeUnderlineHeight: '1px',
    activeDotOpacity: '0.5',
    activeDotWidth: '5px',
    activeDotHeight: '5px'
  })
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)
  await gotoApp(page, '/teacher/exercises')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-exercise-generation')).toBeVisible()
  await gotoApp(page, '/teacher/papers')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-teacher-test-generation')).toBeVisible()

  await gotoApp(page, '/teacher/knowledge')
  await expect(page).toHaveURL(/\/teacher\/knowledge$/)
  await expectLegacyMainLayout(page)
  const knowledgeMenu = page.locator('.side-menu')
  await expect(knowledgeMenu.getByText('教学设计', { exact: true })).toHaveCount(0)
  await expect(knowledgeMenu.getByText('项目实践', { exact: true })).toHaveCount(0)
  await expect(knowledgeMenu.getByText('任务中心', { exact: true })).toHaveCount(0)
  await expect(knowledgeMenu.getByText('知识库', { exact: true })).toBeVisible()
  await expect(knowledgeMenu.locator('.el-menu-item')).toHaveCount(10)

  await gotoApp(page, '/teacher/files')
  const teacherFilesMenu = page.locator('.side-menu')
  await expect(teacherFilesMenu.getByText('鏁欏璁捐', { exact: true })).toHaveCount(0)
  await expect(teacherFilesMenu.getByText('椤圭洰瀹炶返', { exact: true })).toHaveCount(0)
  await expect(teacherFilesMenu.getByText('浠诲姟涓績', { exact: true })).toHaveCount(0)
  await expect(teacherFilesMenu.locator('.el-menu-item')).toHaveCount(10)

  await gotoApp(page, '/teacher/teaching-designs')
  await expect(page).toHaveURL(/\/teacher\/teaching-designs$/)
  await gotoApp(page, '/teacher/projects')
  await expect(page).toHaveURL(/\/teacher\/projects$/)

  await logoutViaUI(page)
  await expect(page.getByTestId('external-login-page')).toBeVisible()
  await loginViaUI(page, accounts.student)
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-main')).toBeVisible()
  await gotoApp(page, '/student/dashboard')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-main')).toBeVisible()
  const loadingMeResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/auth/me') &&
      response.request().method().toUpperCase() === 'GET'
  )
  await gotoAuthLoading(page)
  await expect(page.getByTestId('external-loading-page')).toBeVisible()
  await expect(page.locator('.loading-canvas canvas')).toBeVisible()
  await loadingMeResponse
  await expect(page).toHaveURL(accounts.student.home)
  await gotoApp(page, '/student/courses')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-courses')).toBeVisible()
  await gotoApp(page, '/student/profile')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-portrait')).toBeVisible()
  await gotoApp(page, '/student/resources')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-resources')).toBeVisible()
  await gotoApp(page, '/student/exercises')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-exercises')).toBeVisible()
  await gotoApp(page, '/student/tests')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-tests')).toBeVisible()
  await gotoApp(page, '/student/tutoring')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-tutoring')).toBeVisible()
  await gotoApp(page, '/student/learning-paths')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-study-plan')).toBeVisible()
  await gotoApp(page, '/student/assessments')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-assessments')).toBeVisible()

  await gotoApp(page, '/definitely-not-a-real-route')
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible()

  expectNoPageIssues(issues)
})

test('student my_tests top nav matches my_lessons controls and real routing', async ({ page }) => {
  const issues = collectPageIssues(page)

  await loginViaUI(page, accounts.student)
  await gotoApp(page, '/student/courses')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-courses')).toBeVisible()
  const lessonsTopNavSignature = await collectStudentTopNavSignature(page, '.mine-lessons-page .top-nav')
  await gotoApp(page, '/student/resources')
  await expect(page.getByTestId('external-student-resources')).toBeVisible()
  await gotoApp(page, '/student/tests')
  await expectExternalFullPage(page)
  await expect(page.getByTestId('external-student-tests')).toBeVisible()

  const topNav = page.locator('.tests-page .top-nav')
  await expect(topNav).toHaveCount(1)
  await expect(topNav.locator('.top-brand')).toBeVisible()
  await expect(topNav.locator('.teacher-brand-icon')).toBeVisible()
  await expect(topNav.locator('.top-brand-name strong')).toHaveText('棱镜智教')
  await expect(topNav.locator('.top-brand-name em')).toHaveText('PrismMind')
  await expect(topNav.locator('.top-nav-left .top-nav-button').first()).toHaveClass(/is-active/)
  await expect(topNav.locator('.top-nav-left .top-nav-button')).toHaveCount(2)
  await expect(topNav.locator('.top-nav-right .top-nav-button')).toHaveCount(2)
  const testsTopNavSignature = await collectStudentTopNavSignature(page, '.tests-page .top-nav')
  expect(testsTopNavSignature.nav).toEqual(lessonsTopNavSignature.nav)
  expect(testsTopNavSignature.brandStrong).toEqual(lessonsTopNavSignature.brandStrong)
  expect(testsTopNavSignature.brandEm).toEqual(lessonsTopNavSignature.brandEm)
  expect(testsTopNavSignature.buttons).toEqual(lessonsTopNavSignature.buttons)
  expect(testsTopNavSignature.activeUnderline).toEqual(lessonsTopNavSignature.activeUnderline)
  expect(testsTopNavSignature.activeDot).toMatchObject({
    opacity: '0.5',
    width: '5px',
    height: '5px',
    borderRadius: '50%'
  })
  await topNav.locator('.top-nav-right .top-nav-button').first().click()
  await expect(topNav.locator('.top-user-popover span')).toBeVisible()
  await expect(topNav.locator('.top-user-popover small')).toBeVisible()
  await expect(topNav.locator('.top-user-popover')).not.toContainText('Study operator')
  await expect(topNav.locator('.top-user-popover')).not.toContainText('Resource generation console')
  await expect(page.locator('.main-layout__header')).toHaveCount(0)
  await expect(page.getByTestId('legacy-main-layout')).toHaveCount(0)

  await topNav.locator('.top-nav-left .top-nav-button').nth(1).click()
  await expect(page).toHaveURL(/\/student\/resources$/)

  await gotoApp(page, '/student/tests')
  await page.locator('.tests-page .top-nav .top-nav-left .top-nav-button').first().click()
  await expect(page).toHaveURL(/\/student\/dashboard$/)

  await gotoApp(page, '/student/tests')
  await page.evaluate(() => {
    localStorage.setItem('access_token', 'tests-topnav-access')
    localStorage.setItem('refresh_token', 'tests-topnav-refresh')
    localStorage.setItem('prismmind_probe', 'tests-topnav-prism')
    localStorage.setItem('edugenie_probe', 'tests-topnav-edu')
    sessionStorage.setItem('prismmind_probe', 'tests-topnav-session')
  })
  await page.locator('.tests-page .top-nav .top-nav-right .top-nav-button').nth(1).click()
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

  expectNoPageIssues(issues)
})
