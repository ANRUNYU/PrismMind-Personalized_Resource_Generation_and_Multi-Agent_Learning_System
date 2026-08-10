import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

import { accounts, apiBaseURL, collectPageIssues, expectLegacyMainLayout, expectNoPageIssues, gotoApp, loginViaUI, saveScreenshot } from './helpers'

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

async function pollTask(request: APIRequestContext, token: string, taskId: number) {
  type TaskResult = {
    id: number
    task_type: string
    status: 'pending' | 'running' | 'success' | 'failed'
    progress: number
    result_artifact_id: number | null
    error_message: string | null
  }
  let task: TaskResult | null = null

  for (let attempt = 0; attempt < 60; attempt += 1) {
    task = await dataOf<TaskResult>(
      await request.get(`${apiBaseURL}/tasks/${taskId}`, {
        headers: auth(token)
      })
    )
    if (task && ['success', 'failed'].includes(task.status)) return task
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Task ${taskId} did not finish. Last status: ${task?.status ?? 'unknown'}`)
}

test('async teacher generation produces task status and generated artifact history', async ({ page, request }) => {
  test.setTimeout(180_000)
  const issues = collectPageIssues(page)
  const teacherToken = await loginViaApi(request, accounts.teacher)
  const timestamp = Date.now()

  const asyncSubmit = await dataOf<{
    task_id: number
    task_type: string
    status: string
    polling_url: string
  }>(
    await request.post(`${apiBaseURL}/teacher/course-designs/generate-async`, {
      headers: auth(teacherToken),
      data: {
        course_name: `异步任务专项课程 ${timestamp}`,
        target_students: '软件工程专业学生',
        total_hours: 24,
        course_objectives: '验证异步生成任务、任务中心和 artifact 历史闭环。',
        key_topics: ['Celery', '任务状态', '生成历史'],
        additional_requirements: '输出中文 Markdown，包含任务追踪说明。',
        use_knowledge_base: false,
        top_k: 3
      }
    })
  )
  expect(asyncSubmit.task_id).toBeGreaterThan(0)
  expect(asyncSubmit.polling_url).toContain(`/api/v1/tasks/${asyncSubmit.task_id}`)

  const finishedTask = await pollTask(request, teacherToken, asyncSubmit.task_id)
  expect(['success', 'failed']).toContain(finishedTask.status)
  expect(finishedTask.progress).toBeGreaterThanOrEqual(0)
  if (finishedTask.status === 'failed') {
    expect(finishedTask.error_message).toBeTruthy()
    expect(finishedTask.error_message || '').not.toMatch(/Traceback|IntegrityError/)
    return
  }

  expect(finishedTask.result_artifact_id).toBeGreaterThan(0)
  const artifact = await dataOf<{
    id: number
    artifact_type: string
    title: string
    content: string
    model_name: string | null
  }>(
    await request.get(`${apiBaseURL}/teacher/generated-artifacts/${finishedTask.result_artifact_id}`, {
      headers: auth(teacherToken)
    })
  )
  expect(artifact.id).toBe(finishedTask.result_artifact_id)
  expect(artifact.artifact_type).toBe('course_design')
  expect(artifact.content.length).toBeGreaterThan(20)
  expect(artifact.model_name || 'mock-local').toBeTruthy()

  const tasks = await dataOf<{ items: Array<{ id: number; status: string; result_artifact_id: number | null }>; total: number }>(
    await request.get(`${apiBaseURL}/tasks?page=1&page_size=20`, {
      headers: auth(teacherToken)
    })
  )
  expect(tasks.items.some((item) => item.id === asyncSubmit.task_id && item.result_artifact_id === artifact.id)).toBeTruthy()

  const artifacts = await dataOf<{ items: Array<{ id: number; artifact_type: string; model_name: string | null }>; total: number }>(
    await request.get(`${apiBaseURL}/teacher/generated-artifacts?artifact_type=course_design&page=1&page_size=20`, {
      headers: auth(teacherToken)
    })
  )
  expect(artifacts.items.some((item) => item.id === artifact.id)).toBeTruthy()

  await loginViaUI(page, accounts.teacher)
  await gotoApp(page, '/tasks')
  await expectLegacyMainLayout(page)
  await expect(page.locator('.task-center, .page-stack, .main-layout__content').first()).toBeVisible()
  await gotoApp(page, '/teacher/artifacts')
  await expectLegacyMainLayout(page)
  await expect(page.locator('.table-card, .page-stack, .main-layout__content').first()).toBeVisible()
  await gotoApp(page, `/teacher/artifacts/${artifact.id}`)
  await expectLegacyMainLayout(page)
  await expect(page.locator('.markdown-viewer')).toBeVisible({ timeout: 20_000 })
  const artifactDetailMenu = page.locator('.side-menu')
  await expect(artifactDetailMenu.getByText('教学设计', { exact: true })).toHaveCount(0)
  await expect(artifactDetailMenu.getByText('项目实践', { exact: true })).toHaveCount(0)
  await expect(artifactDetailMenu.getByText('任务中心', { exact: true })).toHaveCount(0)
  await expect(artifactDetailMenu.getByText('生成历史', { exact: true })).toBeVisible()
  await expect(artifactDetailMenu.locator('.el-menu-item')).toHaveCount(10)
  await saveScreenshot(page, 'tasks-artifacts-chain')
  expectNoPageIssues(issues)
})
