import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'

import { accounts, apiBaseURL, collectPageIssues, expectExternalFullPage, expectLegacyMainLayout, expectNoPageIssues, gotoApp, loginViaUI, saveScreenshot } from './helpers'

type ApiEnvelope<T> = {
  data: T
}

type AuthAccount = {
  username: string
  password: string
}

async function loginViaApi(request: APIRequestContext, account: AuthAccount) {
  const response = await request.post(`${apiBaseURL}/auth/login`, {
    data: {
      username: account.username,
      password: account.password
    }
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  const payload = (await response.json()) as ApiEnvelope<{ access_token: string }>
  return payload.data.access_token
}

async function dataOf<T>(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy()
  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

test('LLM status, teacher artifacts, student resources, tests, assessments, and tutoring are persisted', async ({
  page,
  request
}) => {
  test.setTimeout(180_000)
  const issues = collectPageIssues(page)
  const timestamp = Date.now()
  const teacherToken = await loginViaApi(request, accounts.teacher)
  const studentToken = await loginViaApi(request, accounts.student)

  const unauthStatus = await request.get(`${apiBaseURL}/llm/status`)
  expect(unauthStatus.status()).toBe(401)

  const llmStatus = await dataOf<{
    provider: string
    model: string
    real_provider_enabled: boolean
    fallback_enabled: boolean
    configured: boolean
    message: string
  }>(
    await request.get(`${apiBaseURL}/llm/status`, {
      headers: auth(teacherToken)
    })
  )
  expect(llmStatus.provider).toBeTruthy()
  expect(llmStatus.model).toBeTruthy()
  expect(llmStatus.fallback_enabled).toBeTruthy()
  expect(typeof llmStatus.configured).toBe('boolean')
  expect(llmStatus.message).toMatch(/mock|真实模型|模型|fallback|演示/)

  const courseDesign = await dataOf<{
    artifact_id: number
    artifact_type: string
    title: string
    content: string
    model_name?: string
    quality_analysis?: unknown
  }>(
    await request.post(`${apiBaseURL}/teacher/course-designs/generate`, {
      headers: auth(teacherToken),
      data: {
        course_name: `LLM 专项课程设计 ${timestamp}`,
        target_students: '计算机专业本科生',
        total_hours: 32,
        course_objectives: '理解 FastAPI、RAG 和异步任务在教学平台中的作用。',
        key_topics: ['FastAPI', 'RAG', 'Celery'],
        additional_requirements: '请使用中文 Markdown，输出可演示结构。',
        use_knowledge_base: false,
        top_k: 3
      }
    })
  )
  expect(courseDesign.artifact_id).toBeGreaterThan(0)
  expect(courseDesign.content).toContain('教学')
  expect(courseDesign.artifact_type).toBe('course_design')

  const artifactDetail = await dataOf<{
    id: number
    artifact_type: string
    content: string
    request_payload: Record<string, unknown>
    model_name?: string
  }>(
    await request.get(`${apiBaseURL}/teacher/generated-artifacts/${courseDesign.artifact_id}`, {
      headers: auth(teacherToken)
    })
  )
  expect(artifactDetail.id).toBe(courseDesign.artifact_id)
  expect(artifactDetail.content.length).toBeGreaterThan(20)
  expect(artifactDetail.model_name || llmStatus.model).toBeTruthy()
  expect(artifactDetail.request_payload.course_name).toContain('LLM 专项课程设计')

  const artifactList = await dataOf<{
    items: Array<{ id: number; artifact_type: string; model_name?: string }>
    total: number
  }>(
    await request.get(`${apiBaseURL}/teacher/generated-artifacts?artifact_type=course_design&page=1&page_size=20`, {
      headers: auth(teacherToken)
    })
  )
  expect(artifactList.items.some((item) => item.id === courseDesign.artifact_id)).toBeTruthy()

  const resource = await dataOf<{
    resources: Array<{ id: number; title: string; content: string; status?: string; quality_analysis?: unknown }>
  }>(
    await request.post(`${apiBaseURL}/student/resources/generate`, {
      headers: auth(studentToken),
      data: {
        topic: `LLM 专项学习资源 ${timestamp}`,
        resource_types: ['concept_explanation'],
        difficulty: 'normal',
        knowledge_points: ['FastAPI', '依赖注入'],
        learning_goal: '掌握 FastAPI 依赖注入和数据库会话管理。',
        use_profile: true,
        use_knowledge_base: false,
        top_k: 3
      }
    })
  )
  expect(resource.resources.length).toBeGreaterThan(0)
  const resourceId = resource.resources[0].id
  expect(resource.resources[0].content.length).toBeGreaterThan(20)

  const resourceDetail = await dataOf<{ id: number; title: string; content: string }>(
    await request.get(`${apiBaseURL}/student/resources/${resourceId}`, {
      headers: auth(studentToken)
    })
  )
  expect(resourceDetail.id).toBe(resourceId)

  const tutoring = await dataOf<{ session_id: number; answer: string; used_knowledge_base: boolean; warnings: string[] }>(
    await request.post(`${apiBaseURL}/student/tutoring/ask`, {
      headers: auth(studentToken),
      data: {
        question: '请解释 FastAPI 依赖注入如何帮助学习数据库会话管理。',
        use_knowledge_base: false,
        top_k: 3,
        response_format: 'markdown',
        difficulty: 'normal'
      }
    })
  )
  expect(tutoring.session_id).toBeGreaterThan(0)
  expect(tutoring.answer.length).toBeGreaterThan(20)

  const tutoringSessions = await dataOf<{ items: Array<{ id: number; ai_response: string }> }>(
    await request.get(`${apiBaseURL}/student/tutoring/sessions?page=1&page_size=20`, {
      headers: auth(studentToken)
    })
  )
  expect(tutoringSessions.items.some((item) => item.id === tutoring.session_id)).toBeTruthy()

  const generatedTest = await dataOf<{
    test_id: number
    questions: Array<{ id: string; question_type: string }>
  }>(
    await request.post(`${apiBaseURL}/student/tests/generate`, {
      headers: auth(studentToken),
      data: {
        topic: `LLM 专项测试 ${timestamp}`,
        difficulty: 'medium',
        question_count: 4,
        question_types: ['single_choice', 'multiple_choice', 'true_false', 'short_answer'],
        knowledge_points: ['FastAPI'],
        use_question_bank: true
      }
    })
  )
  expect(generatedTest.test_id).toBeGreaterThan(0)
  const beforeSubmit = await dataOf<{ id: number; answers: unknown | null; questions: Array<{ id: string; question_type: string }> }>(
    await request.get(`${apiBaseURL}/student/tests/${generatedTest.test_id}`, {
      headers: auth(studentToken)
    })
  )
  expect(beforeSubmit.answers).toBeNull()
  await dataOf<unknown>(
    await request.post(`${apiBaseURL}/student/tests/${generatedTest.test_id}/start`, {
      headers: auth(studentToken)
    })
  )
  const answers: Record<string, unknown> = {}
  for (const question of beforeSubmit.questions) {
    if (question.question_type === 'multiple_choice') answers[question.id] = ['A']
    else if (question.question_type === 'true_false') answers[question.id] = true
    else answers[question.id] = 'A'
  }
  const submitted = await dataOf<{ score: number; answers: Record<string, unknown>; quality_analysis?: unknown }>(
    await request.post(`${apiBaseURL}/student/tests/${generatedTest.test_id}/submit`, {
      headers: auth(studentToken),
      data: {
        user_answers: answers
      }
    })
  )
  expect(submitted.score).toBeGreaterThanOrEqual(0)
  expect(Object.keys(submitted.answers).length).toBeGreaterThan(0)

  const assessment = await dataOf<{
    id: number
    score: number
    quality_analysis?: unknown
  }>(
    await request.post(`${apiBaseURL}/student/assessments`, {
      headers: auth(studentToken),
      data: {
        assessment_type: 'topic',
        topic: `LLM 专项评估 ${timestamp}`,
        score: 85,
        correct_topics: ['FastAPI'],
        incorrect_topics: ['Chroma'],
        learning_evidence: {
          note: '专项验收创建评估记录。'
        }
      }
    })
  )
  expect(assessment.id).toBeGreaterThan(0)

  const summary = await dataOf<{ total_assessments: number }>(
    await request.get(`${apiBaseURL}/student/assessments/summary`, {
      headers: auth(studentToken)
    })
  )
  expect(summary.total_assessments).toBeGreaterThan(0)

  await loginViaUI(page, accounts.teacher)
  for (const route of ['/teacher/course-designs', '/teacher/exercises', '/teacher/papers', '/teacher/artifacts']) {
    await gotoApp(page, route)
    if (route === '/teacher/artifacts') {
      await expectLegacyMainLayout(page)
    } else {
      await expectExternalFullPage(page)
    }
  }
  await logoutThroughRoute(page)
  await loginViaUI(page, accounts.student)
  for (const route of ['/student/resources', '/student/tutoring', '/student/tests', '/student/assessments']) {
    await gotoApp(page, route)
    await expectExternalFullPage(page)
  }
  await saveScreenshot(page, 'llm-generation-chain')
  expectNoPageIssues(issues)
})

async function logoutThroughRoute(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}
