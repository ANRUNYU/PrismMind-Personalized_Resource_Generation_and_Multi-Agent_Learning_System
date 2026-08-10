import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

import {
  accounts,
  apiBaseURL,
  collectPageIssues,
  expectExternalFullPage,
  expectLegacyMainLayout,
  expectNoPageIssues,
  gotoApp,
  loginViaUI,
  saveScreenshot
} from './helpers'

type ApiEnvelope<T> = {
  data: T
  message?: string
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

async function uploadFile(
  request: APIRequestContext,
  token: string,
  file: { name: string; mimeType: string; body: string | Buffer }
) {
  return dataOf<{
    id: number
    original_filename: string
    content_type: string
    file_size: number
    parse_status: string
  }>(
    await request.post(`${apiBaseURL}/files/upload`, {
      headers: auth(token),
      multipart: {
        asset_type: 'knowledge_source',
        file: {
          name: file.name,
          mimeType: file.mimeType,
          buffer: Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body, 'utf-8')
        }
      }
    })
  )
}

async function createKnowledgeDocument(request: APIRequestContext, token: string, fileId: number, title: string) {
  return dataOf<{
    id: number
    title: string
    file_asset_id: number
    status: string
    chunk_count: number
  }>(
    await request.post(`${apiBaseURL}/knowledge/documents`, {
      headers: auth(token),
      data: {
        file_id: fileId,
        title,
        source_type: 'upload'
      }
    })
  )
}

async function createCourse(request: APIRequestContext, token: string, name: string) {
  return dataOf<{ id: number; name: string; code: string }>(
    await request.post(`${apiBaseURL}/courses`, {
      headers: auth(token),
      data: {
        name,
        description: 'Knowledge/RAG E2E course context for assistant validation.'
      }
    })
  )
}

async function createCourseKnowledgeDocument(
  request: APIRequestContext,
  token: string,
  courseId: number,
  fileId: number,
  title: string
) {
  return dataOf<{
    id: number
    title: string
    file_id: number
    status: string
    chunk_count: number
    course_id: number
  }>(
    await request.post(`${apiBaseURL}/courses/${courseId}/knowledge/documents`, {
      headers: auth(token),
      data: {
        file_id: fileId,
        title
      }
    })
  )
}

test('file center, knowledge ingest, Chroma retrieve, and assistant RAG use real APIs', async ({ page, request }) => {
  test.setTimeout(180_000)
  const issues = collectPageIssues(page)
  const timestamp = Date.now()
  const teacherToken = await loginViaApi(request, accounts.teacher)
  const studentToken = await loginViaApi(request, accounts.student)

  const txtFile = await uploadFile(request, teacherToken, {
    name: `knowledge-rag-fastapi-${timestamp}.txt`,
    mimeType: 'text/plain',
    body:
      'FastAPI 依赖注入用于管理数据库会话。' +
      '在棱镜智教-PrismMind 中，路由函数通过 Depends 获取 Session，并在请求结束后释放。'
  })
  expect(txtFile.id).toBeGreaterThan(0)
  expect(txtFile.file_size).toBeGreaterThan(0)

  const mdFile = await uploadFile(request, teacherToken, {
    name: `knowledge-rag-delete-${timestamp}.md`,
    mimeType: 'text/markdown',
    body: '# 临时知识库文档\n\n该文档用于验证 Markdown 上传、入库和删除链路。'
  })
  expect(mdFile.original_filename).toContain('.md')

  const fileList = await dataOf<{ items: Array<{ id: number; original_filename: string }>; total: number }>(
    await request.get(`${apiBaseURL}/files?page=1&page_size=50`, {
      headers: auth(teacherToken)
    })
  )
  expect(fileList.items.some((item) => item.id === txtFile.id)).toBeTruthy()
  expect(fileList.items.some((item) => item.id === mdFile.id)).toBeTruthy()

  const fileDetail = await dataOf<{
    id: number
    owner_id: number
    original_filename: string
    content_type: string
    file_size: number
    created_at: string
  }>(
    await request.get(`${apiBaseURL}/files/${txtFile.id}`, {
      headers: auth(teacherToken)
    })
  )
  expect(fileDetail.original_filename).toBe(txtFile.original_filename)
  expect(fileDetail.file_size).toBe(txtFile.file_size)
  expect(fileDetail.owner_id).toBeGreaterThan(0)
  expect(fileDetail.created_at).toBeTruthy()

  const download = await request.get(`${apiBaseURL}/files/${txtFile.id}/download`, {
    headers: auth(teacherToken)
  })
  expect(download.ok(), await download.text()).toBeTruthy()
  expect(await download.text()).toContain('FastAPI 依赖注入用于管理数据库会话')

  const forbiddenFile = await request.get(`${apiBaseURL}/files/${txtFile.id}`, {
    headers: auth(studentToken)
  })
  expect(forbiddenFile.status()).toBe(403)

  const invalidFile = await request.post(`${apiBaseURL}/files/upload`, {
    headers: auth(teacherToken),
    multipart: {
      asset_type: 'knowledge_source',
      file: {
        name: `invalid-${timestamp}.exe`,
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('not allowed', 'utf-8')
      }
    }
  })
  expect(invalidFile.status()).toBe(400)
  expect(await invalidFile.text()).toContain('不支持')

  const emptyFile = await request.post(`${apiBaseURL}/files/upload`, {
    headers: auth(teacherToken),
    multipart: {
      asset_type: 'knowledge_source',
      file: {
        name: `empty-${timestamp}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from('')
      }
    }
  })
  expect(emptyFile.status()).toBe(400)
  expect(await emptyFile.text()).toContain('不能为空')

  const doc = await createKnowledgeDocument(request, teacherToken, txtFile.id, `FastAPI 依赖注入专项 ${timestamp}`)
  expect(doc.id).toBeGreaterThan(0)
  expect(doc.status).toBe('pending')

  const ingest = await dataOf<{ document_id: number; status: string; chunk_count: number; chroma_collection: string }>(
    await request.post(`${apiBaseURL}/knowledge/documents/${doc.id}/ingest`, {
      headers: auth(teacherToken)
    })
  )
  expect(ingest.status).toBe('ingested')
  expect(ingest.chunk_count).toBeGreaterThan(0)
  expect(ingest.chroma_collection).toBeTruthy()

  const docDetail = await dataOf<{ id: number; status: string; file_asset_id: number; chunk_count: number }>(
    await request.get(`${apiBaseURL}/knowledge/documents/${doc.id}`, {
      headers: auth(teacherToken)
    })
  )
  expect(docDetail.status).toBe('ingested')
  expect(docDetail.file_asset_id).toBe(txtFile.id)
  expect(docDetail.chunk_count).toBeGreaterThan(0)

  const retrieve = await dataOf<{
    results: Array<{ content: string; metadata: Record<string, unknown>; score: number | null }>
  }>(
    await request.post(`${apiBaseURL}/knowledge/retrieve`, {
      headers: auth(teacherToken),
      data: {
        query: 'FastAPI 如何管理数据库会话？',
        document_id: doc.id,
        top_k: 3
      }
    })
  )
  expect(retrieve.results.length).toBeGreaterThan(0)
  expect(retrieve.results[0].content).toContain('FastAPI')
  expect(retrieve.results[0].content).toContain('数据库会话')
  expect(retrieve.results[0].metadata.document_id).toBe(doc.id)
  expect(retrieve.results[0].metadata.source_filename).toBe(txtFile.original_filename)
  expect(typeof retrieve.results[0].score === 'number' || retrieve.results[0].score === null).toBeTruthy()

  const unrelated = await dataOf<{
    results: Array<{ content: string; metadata: Record<string, unknown>; score: number | null }>
  }>(
    await request.post(`${apiBaseURL}/knowledge/retrieve`, {
      headers: auth(teacherToken),
      data: {
        query: '唐代诗歌的边塞意象是什么？',
        document_id: doc.id,
        top_k: 1
      }
    })
  )
  expect(unrelated.results.length).toBeGreaterThanOrEqual(0)
  if (unrelated.results[0]) {
    expect(typeof unrelated.results[0].score === 'number' || unrelated.results[0].score === null).toBeTruthy()
  }

  const course = await createCourse(request, teacherToken, `RAG 助手专项课程 ${timestamp}`)
  const courseDoc = await createCourseKnowledgeDocument(
    request,
    teacherToken,
    course.id,
    txtFile.id,
    `课程 FastAPI 知识 ${timestamp}`
  )
  await dataOf<{ chunk_count: number }>(
    await request.post(`${apiBaseURL}/courses/${course.id}/knowledge/documents/${courseDoc.id}/ingest`, {
      headers: auth(teacherToken)
    })
  )

  const session = await dataOf<{ id: number }>(
    await request.post(`${apiBaseURL}/assistant/sessions`, {
      headers: auth(teacherToken),
      data: {
        course_id: course.id,
        title: `RAG 专项 ${timestamp}`,
        mode: 'course_qa'
      }
    })
  )
  const assistantAnswer = await dataOf<{
    answer: string
    references: Array<{ filename?: string; document_id?: number; excerpt: string }>
    session: { id: number; message_count: number }
  }>(
    await request.post(`${apiBaseURL}/assistant/sessions/${session.id}/messages`, {
      headers: auth(teacherToken),
      data: {
        message: '请基于课程知识库说明 FastAPI 如何管理数据库会话。',
        course_id: course.id,
        use_course_knowledge: true,
        knowledge_document_ids: [courseDoc.id],
        top_k: 3
      }
    })
  )
  expect(assistantAnswer.answer.length).toBeGreaterThan(20)
  expect(assistantAnswer.references.length).toBeGreaterThan(0)
  expect(assistantAnswer.references[0].document_id).toBe(courseDoc.id)

  const sessionHistory = await dataOf<{ id: number; messages: Array<{ role: string; content: string }> }>(
    await request.get(`${apiBaseURL}/assistant/sessions/${session.id}`, {
      headers: auth(teacherToken)
    })
  )
  expect(sessionHistory.messages.some((message) => message.role === 'assistant')).toBeTruthy()

  const deleteDoc = await createKnowledgeDocument(request, teacherToken, mdFile.id, `删除链路专项 ${timestamp}`)
  await dataOf<{ chunk_count: number }>(
    await request.post(`${apiBaseURL}/knowledge/documents/${deleteDoc.id}/ingest`, {
      headers: auth(teacherToken)
    })
  )
  const deletion = await dataOf<{ document_id: number; deleted: boolean; deleted_chunks: number }>(
    await request.delete(`${apiBaseURL}/knowledge/documents/${deleteDoc.id}`, {
      headers: auth(teacherToken)
    })
  )
  expect(deletion.deleted).toBeTruthy()
  expect(deletion.deleted_chunks).toBeGreaterThan(0)
  const deletedDetail = await request.get(`${apiBaseURL}/knowledge/documents/${deleteDoc.id}`, {
    headers: auth(teacherToken)
  })
  expect(deletedDetail.status()).toBe(404)

  await loginViaUI(page, accounts.teacher)
  for (const route of ['/teacher/files', '/teacher/knowledge', '/teacher/courses', `/teacher/courses/${course.id}`, '/assistant']) {
    await gotoApp(page, route)
    if (route === '/assistant') {
      await expect(page.locator('.assistant-page')).toBeVisible()
    } else if (route === '/teacher/courses') {
      await expectExternalFullPage(page)
      await expect(page.getByTestId('external-teacher-courses')).toBeVisible()
    } else {
      await expectLegacyMainLayout(page)
    }
  }
  await saveScreenshot(page, 'knowledge-rag-chain')
  expectNoPageIssues(issues)
})
