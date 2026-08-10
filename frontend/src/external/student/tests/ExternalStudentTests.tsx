import { useEffect, useMemo, useState } from 'react'
import { listFiles, type FileAsset } from '@/api/files'
import { getKnowledgeDocuments, type KnowledgeDocument } from '@/api/knowledge'

import {
  generateStudentTest,
  getStudentTest,
  getStudentTests,
  startStudentTest,
  submitStudentTest,
  type StudentTestSummary,
  type TestAnswerValue,
  type TestDetail,
  type TestQuestion,
  type TestSubmitResponse
} from '@/api/tests'

import CardSystem from './components/CardSystem'
import DetailPanel from './components/DetailPanel'
import SceneLayer from './components/SceneLayer'
import TopNav from './components/TopNav'
import type { TestCardModel } from './types'
import './tests-page.css'

const accentPalette = ['#9cd7dc', '#b7c8ff', '#efbfd0', '#f4d38d', '#98d6b2', '#b5e2d6']

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function difficultyText(value?: string | null) {
  const map: Record<string, string> = {
    easy: '基础',
    medium: '中等',
    hard: '困难',
    mixed: '混合'
  }
  return value ? map[value] || value : '中等'
}

function statusText(value?: string | null) {
  const map: Record<string, string> = {
    generated: '待开始',
    in_progress: '作答中',
    submitted: '已提交',
    cancelled: '已取消'
  }
  return value ? map[value] || value : '待开始'
}

function questionTypeText(value: string) {
  const map: Record<string, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    true_false: '判断题',
    short_answer: '简答题'
  }
  return map[value] || value
}

function buildSections(detail?: TestDetail | null, questionCount = 0) {
  if (!detail?.questions?.length) {
    return [{ name: '综合题组', ratio: 100, count: questionCount }]
  }

  const counts = detail.questions.reduce<Record<string, number>>((acc, question) => {
    acc[question.question_type] = (acc[question.question_type] || 0) + 1
    return acc
  }, {})
  const total = detail.questions.length || 1
  return Object.entries(counts).map(([type, count]) => ({
    name: questionTypeText(type),
    ratio: Math.max(12, Math.round((count / total) * 100)),
    count
  }))
}

function sumScore(detail?: TestDetail | null, questionCount = 0) {
  if (!detail?.questions?.length) return questionCount * 10
  return Math.round(detail.questions.reduce((sum, question) => sum + (question.score || 0), 0))
}

function toCard(summary: StudentTestSummary, index: number, detail?: TestDetail | null): TestCardModel {
  const questionCount = detail?.questions?.length || summary.question_count || 0
  return {
    id: summary.id,
    title: summary.topic || `测试 #${summary.id}`,
    course: '学生自测',
    updatedAt: formatDate(summary.submitted_at || summary.started_at || summary.created_at),
    creator: '棱镜智教-PrismMind',
    source: 'AI 生成测验',
    questionCount,
    totalScore: sumScore(detail, questionCount),
    duration: Math.max(15, questionCount * 4),
    difficulty: difficultyText(summary.difficulty),
    favorite: summary.status === 'submitted',
    summary: `${statusText(summary.status)} · ${difficultyText(summary.difficulty)} · ${questionCount} 题`,
    sections: buildSections(detail, questionCount),
    accent: accentPalette[index % accentPalette.length],
    status: summary.status,
    score: summary.score,
    raw: summary
  }
}

export default function ExternalStudentTests() {
  const [tests, setTests] = useState<TestCardModel[]>([])
  const [selectedTest, setSelectedTest] = useState<TestCardModel | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [statusMessage, setStatusMessage] = useState('正在加载我的测试...')
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [current, setCurrent] = useState<TestDetail | null>(null)
  const [answers, setAnswers] = useState<Record<string, TestAnswerValue>>({})
  const [submitResult, setSubmitResult] = useState<TestSubmitResponse | null>(null)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<FileAsset[]>([])
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([])
  const [generationSources, setGenerationSources] = useState<Array<Record<string, unknown>>>([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState('')

  async function loadEvidence(autoSelectReady = false) {
    setEvidenceLoading(true)
    try {
      const [fileResponse, documentResponse] = await Promise.all([listFiles({ page: 1, page_size: 50 }), getKnowledgeDocuments({ page: 1, page_size: 50 })])
      const nextFiles = fileResponse.items
      const nextDocuments = documentResponse.items
      const readyDocumentIds = nextDocuments.filter((document) => document.status === 'ingested').map((document) => document.id)
      const readyFileIds = nextFiles
        .filter((file) => file.parse_status === 'parsed' && !file.knowledge_document_id)
        .map((file) => file.id)
      setFiles(nextFiles)
      setDocuments(nextDocuments)
      setSelectedFileIds((ids) => {
        const valid = ids.filter((id) => readyFileIds.includes(id))
        if (!autoSelectReady) return valid
        return readyDocumentIds.length > 0 ? [] : readyFileIds.slice(0, 1)
      })
      setSelectedDocumentIds((ids) => {
        const valid = ids.filter((id) => readyDocumentIds.includes(id))
        return autoSelectReady ? readyDocumentIds.slice(0, 1) : valid
      })
      setEvidenceError('')
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : '知识来源状态加载失败')
    } finally {
      setEvidenceLoading(false)
    }
  }

  async function openTest(test: TestCardModel, index = activeIndex) {
    setSelectedTest(test)
    setActiveIndex(index >= 0 ? index : 0)
    setDetailLoading(true)
    setSubmitResult(null)
    setError('')
    try {
      const detail = await getStudentTest(test.id)
      const detailCard = toCard(detail, index, detail)
      setSelectedTest(detailCard)
      setCurrent(detail)
      setAnswers(detail.status === 'in_progress' ? detail.user_answers || {} : {})
      setStatusMessage('已打开测试详情')
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试详情加载失败')
    } finally {
      setDetailLoading(false)
    }
  }

  async function loadTests(preferredId?: number) {
    setListLoading(true)
    setError('')
    try {
      const response = await getStudentTests({ page: 1, page_size: 24 })
      const cards = response.items.map((item, index) => toCard(item, index))
      setTests(cards)
      setTotal(response.total)
      setStatusMessage('测试记录已更新')

      const nextIndex = Math.max(
        0,
        preferredId ? cards.findIndex((item) => item.id === preferredId) : selectedTest ? cards.findIndex((item) => item.id === selectedTest.id) : 0
      )
      if (cards[nextIndex]) {
        await openTest(cards[nextIndex], nextIndex)
      } else {
        setSelectedTest(null)
        setCurrent(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试列表加载失败')
    } finally {
      setListLoading(false)
    }
  }

  async function createTest() {
    const topic = query.trim()
    if (!topic) {
      setError('请输入测试主题后再生成测试。')
      return
    }

    setActionBusy(true)
    setError('')
    try {
      const response = await generateStudentTest({
        topic,
        difficulty: 'medium',
        question_count: 5,
        question_types: ['single_choice', 'multiple_choice', 'true_false', 'short_answer'],
        knowledge_points: [],
        resource_id: null,
        path_id: null,
        use_question_bank: true,
        file_ids: selectedFileIds,
        knowledge_document_ids: selectedDocumentIds,
        use_knowledge_base: selectedFileIds.length > 0 || selectedDocumentIds.length > 0,
        top_k: 5
      })
      setGenerationSources(response.references || [])
      setQuery('')
      setStatusMessage('测试已生成')
      await loadTests(response.test_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试生成失败')
    } finally {
      setActionBusy(false)
    }
  }

  async function startCurrent() {
    if (!current) return
    setActionBusy(true)
    setError('')
    try {
      const detail = await startStudentTest(current.id)
      setCurrent(detail)
      setAnswers(detail.user_answers || {})
      setStatusMessage('已进入作答状态')
      setTests((items) => items.map((item, index) => (item.id === detail.id ? toCard(detail, index, detail) : item)))
      setSelectedTest((selected) => (selected && selected.id === detail.id ? toCard(detail, activeIndex, detail) : selected))
    } catch (err) {
      setError(err instanceof Error ? err.message : '开始测试失败')
    } finally {
      setActionBusy(false)
    }
  }

  async function submitCurrent() {
    if (!current) return
    setActionBusy(true)
    setError('')
    try {
      const result = await submitStudentTest(current.id, { user_answers: answers })
      setSubmitResult(result)
      const detail = await getStudentTest(current.id)
      setCurrent(detail)
      setStatusMessage('测试已提交，评分与解析已生成')
      await loadTests(current.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交测试失败')
    } finally {
      setActionBusy(false)
    }
  }

  function updateAnswer(question: TestQuestion, value: TestAnswerValue) {
    setAnswers((previous) => ({ ...previous, [question.id]: value }))
  }

  useEffect(() => {
    const requestedTestId = Number(new URLSearchParams(window.location.search).get('testId'))
    loadTests(Number.isInteger(requestedTestId) && requestedTestId > 0 ? requestedTestId : undefined)
    void loadEvidence(true)
    const refresh = () => void loadEvidence(true)
    const timer = window.setInterval(() => void loadEvidence(), 4000)
    window.addEventListener('student-test-evidence-updated', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('student-test-evidence-updated', refresh)
    }
  }, [])

  const filteredTests = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return tests
    return tests.filter((test) =>
      [test.title, test.course, test.difficulty, test.creator, test.status].some((item) => String(item).toLowerCase().includes(keyword))
    )
  }, [tests, query])

  useEffect(() => {
    if (activeIndex >= filteredTests.length) {
      setActiveIndex(0)
      if (filteredTests[0]) {
        openTest(filteredTests[0], 0)
      }
    }
  }, [activeIndex, filteredTests])

  const stats = useMemo(
    () => ({
      total: total || tests.length,
      questions: tests.reduce((sum, test) => sum + test.questionCount, 0),
      score: tests.reduce((sum, test) => sum + test.totalScore, 0),
      duration: tests.reduce((sum, test) => sum + test.duration, 0)
    }),
    [tests, total]
  )

  return (
    <main className="page tests-page" data-testid="external-student-tests">
      <TopNav />
      <section className="page-grid">
        <div className="workspace-column">
          <header className="page-hero">
            <div>
              <h1>我的测试</h1>
              <span>My Tests</span>
              <p>生成、作答、提交并复盘你的全部学习测试与答案解析。</p>
            </div>
            <div className="toolbar-row">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input value={query} placeholder="搜索或输入新测试主题，例如：Python 函数、机器学习基础" onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button className="refresh-button" type="button" disabled={listLoading || actionBusy} onClick={() => loadTests(selectedTest?.id)}>
                刷新
              </button>
              <button className="add-button" type="button" disabled={actionBusy} onClick={createTest}>
                {actionBusy ? '处理中...' : '生成测试'}
              </button>
            </div>
            {error ? <div className="test-error">{error}</div> : null}
            <section className="test-evidence-panel" aria-label="测验知识来源">
              <div className="test-evidence-heading">
                <div>
                  <h2>选择出题知识来源</h2>
                  <p>上传后会自动解析并进入个人知识库；只有就绪资料可用于出题。</p>
                </div>
                <button type="button" disabled={evidenceLoading} onClick={() => void loadEvidence(true)}>
                  {evidenceLoading ? '刷新中…' : '刷新并选择最新就绪资料'}
                </button>
              </div>
              {evidenceError ? <p className="test-evidence-error" role="alert">{evidenceError}</p> : null}
              <div className="test-evidence-list">
                {files.map((file) => {
                  const linkedDocument = documents.find((document) => document.id === file.knowledge_document_id)
                  const selectable = file.parse_status === 'parsed' && !linkedDocument
                  return <label key={file.id} className={selectable ? 'is-ready' : ''}>
                    <input type="checkbox" disabled={!selectable} checked={selectedFileIds.includes(file.id)} onChange={(event) => setSelectedFileIds((ids) => event.target.checked ? [...ids, file.id] : ids.filter((id) => id !== file.id))} />
                    <span>
                      <strong>{file.original_filename}</strong>
                      <small>
                        <em data-status={file.parse_status}>解析：{fileParseStatusText(file.parse_status)}</em>
                        <em data-status={file.knowledge_ingest_status || 'not_started'}>入库：{ingestStatusText(file.knowledge_ingest_status)}</em>
                      </small>
                      {file.parse_error ? <b>{file.parse_error}</b> : null}
                    </span>
                  </label>
                })}
              </div>
              <div className="test-evidence-list test-document-list">
                {documents.map((document) => <label key={document.id} className={document.status === 'ingested' ? 'is-ready' : ''}>
                  <input type="checkbox" disabled={document.status !== 'ingested'} checked={selectedDocumentIds.includes(document.id)} onChange={(event) => setSelectedDocumentIds((ids) => event.target.checked ? [...ids, document.id] : ids.filter((id) => id !== document.id))} />
                  <span>
                    <strong>{document.title}</strong>
                    <small><em data-status={document.status}>知识库：{documentStatusText(document.status)} · {document.chunk_count} 个分块</em></small>
                  </span>
                </label>)}
              </div>
              {!files.length && !documents.length ? <p>尚未上传个人资料。请在上方批量上传，系统会自动解析并入库。</p> : null}
              {!selectedFileIds.length && !selectedDocumentIds.length ? <p role="status">本次测验未使用个人知识库，无法计算来源覆盖率。</p> : null}
              {generationSources.length ? <p className="test-evidence-used">本次实际使用 {generationSources.length} 条知识来源。</p> : null}
            </section>
          </header>

          <div className="test-workbench">
            <nav className="test-filter-rail" aria-label="测试筛选">
              <button type="button">
                全部测试 <strong>{tests.length}</strong>
              </button>
              <button type="button">
                待开始 <strong>{tests.filter((test) => test.status === 'generated').length}</strong>
              </button>
              <button type="button">
                作答中 <strong>{tests.filter((test) => test.status === 'in_progress').length}</strong>
              </button>
              <button type="button">
                已提交 <strong>{tests.filter((test) => test.status === 'submitted').length}</strong>
              </button>
              <button type="button">
                总记录 <strong>{total}</strong>
              </button>
            </nav>
            <SceneLayer>
              {listLoading ? (
                <div className="test-empty-state">正在加载测试列表</div>
              ) : filteredTests.length ? (
                <CardSystem
                  activeIndex={activeIndex}
                  selectedId={selectedTest?.id}
                  tests={filteredTests}
                  onActiveChange={(nextIndex) => {
                    setActiveIndex(nextIndex)
                    const nextTest = filteredTests[nextIndex]
                    if (nextTest) openTest(nextTest, nextIndex)
                  }}
                  onSelect={(test, index) => openTest(test, index)}
                />
              ) : (
                <div className="test-empty-state">暂无测试记录，可以先输入主题生成一次学习测试。</div>
              )}
            </SceneLayer>
          </div>
        </div>

        <aside className="side-column">
          <div className="stats-panel">
            <span>
              <strong>{stats.total}</strong>
              测试总数
            </span>
            <span>
              <strong>{stats.questions}</strong>
              总题目数
            </span>
            <span>
              <strong>{stats.score}</strong>
              总分值
            </span>
            <span>
              <strong>{stats.duration}</strong>
              总时长
            </span>
          </div>
          <DetailPanel
            actionBusy={actionBusy}
            answers={answers}
            detail={current}
            loading={detailLoading}
            status={statusMessage}
            submitResult={submitResult}
            test={selectedTest}
            onAnswerChange={updateAnswer}
            onCreate={createTest}
            onRefresh={() => {
              if (selectedTest) openTest(selectedTest, activeIndex)
            }}
            onStart={startCurrent}
            onSubmit={submitCurrent}
          />
        </aside>
      </section>
    </main>
  )
}

function fileParseStatusText(status: string) {
  return ({ pending: '等待解析', parsing: '解析中', parsed: '已解析', failed: '解析失败', deleted: '已删除' } as Record<string, string>)[status] || status
}

function ingestStatusText(status?: string | null) {
  if (!status) return '未开始'
  return ({ pending: '等待入库', parsing: '解析与入库中', ingesting: '向量入库中', ingested: '已入库', failed: '入库失败' } as Record<string, string>)[status] || status
}

function documentStatusText(status: string) {
  return ({ pending: '等待入库', created: '已创建', parsing: '解析与入库中', ingesting: '向量入库中', ingested: '已入库', failed: '入库失败' } as Record<string, string>)[status] || status
}
