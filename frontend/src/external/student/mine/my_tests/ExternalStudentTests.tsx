import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { deleteFile, listFiles, type FileAsset } from '@/api/files'
import { deleteKnowledgeDocument, getKnowledgeDocuments, type KnowledgeDocument } from '@/api/knowledge'
import type { TestAnswerValue, TestDetail, TestQuestion, TestSubmitResponse } from '@/types/test'

import { ApiAdapter, toCard } from './api/ApiAdapter'
import DetailPanel from './components/DetailPanel'
import TopNav from './components/TopNav'
import { GenerationProgress, useSimulatedGenerationProgress } from '../../../shared/GenerationProgress'
import { TaskStreamPanel } from '../../../shared/TaskStreamPanel'
import type { TestCardModel } from './types'
import './tests-page.css'

type TestFilter = 'all' | 'generated' | 'in_progress' | 'submitted' | 'records'

export default function ExternalStudentTests() {
  const [tests, setTests] = useState<TestCardModel[]>([])
  const [selectedTest, setSelectedTest] = useState<TestCardModel | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeFilter, setActiveFilter] = useState<TestFilter>('all')
  const [query, setQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [statusMessage, setStatusMessage] = useState('正在加载我的测验...')
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
  const [generationTaskId, setGenerationTaskId] = useState<number | null>(null)
  const [generationActive, setGenerationActive] = useState(false)
  const [generationFailed, setGenerationFailed] = useState(false)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState('')
  const [removingEvidenceKey, setRemovingEvidenceKey] = useState('')
  const selectedTestRef = useRef<TestCardModel | null>(null)

  selectedTestRef.current = selectedTest
  const simulatedProgress = useSimulatedGenerationProgress({
    active: generationActive && !generationTaskId,
    failed: generationFailed,
    resetKey: query
  })

  const loadEvidence = useCallback(async (autoSelectReady = false) => {
    setEvidenceLoading(true)
    try {
      const [fileResponse, documentResponse] = await Promise.all([
        listFiles({ page: 1, page_size: 50 }),
        getKnowledgeDocuments({ page: 1, page_size: 50 })
      ])
      const nextFiles = fileResponse.items
      const nextDocuments = documentResponse.items
      const readyDocumentIds = nextDocuments.filter((document) => document.status === 'ingested').map((document) => document.id)
      const linkedFileIds = new Set(nextDocuments.map((document) => document.file_asset_id).filter((id): id is number => typeof id === 'number'))
      const readyFileIds = nextFiles
        .filter((file) => file.parse_status === 'parsed' && !file.knowledge_document_id && !linkedFileIds.has(file.id))
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
  }, [])

  const removeEvidence = useCallback(async (file?: FileAsset, document?: KnowledgeDocument) => {
    const title = file?.original_filename || document?.title || '该资料'
    if (!window.confirm(`确认移除“${title}”吗？知识库分块和上传文件将一并删除，且无法恢复。`)) return

    const key = `${file?.id || 0}-${document?.id || 0}`
    setRemovingEvidenceKey(key)
    setEvidenceError('')
    try {
      if (document) await deleteKnowledgeDocument(document.id)
      if (file) await deleteFile(file.id)
      if (file) setSelectedFileIds((ids) => ids.filter((id) => id !== file.id))
      if (document) setSelectedDocumentIds((ids) => ids.filter((id) => id !== document.id))
      setStatusMessage(`已移除知识来源：${title}`)
      await loadEvidence(false)
    } catch (err) {
      setEvidenceError(err instanceof Error ? err.message : '资料移除失败，请稍后重试')
      await loadEvidence(false)
    } finally {
      setRemovingEvidenceKey('')
    }
  }, [loadEvidence])

  const openTest = useCallback(async (test: TestCardModel, index = 0) => {
    setSelectedTest(test)
    setActiveIndex(index >= 0 ? index : 0)
    setDetailLoading(true)
    setSubmitResult(null)
    setError('')
    try {
      const detail = await ApiAdapter.getTest(test.id)
      const detailCard = toCard(detail, index, detail)
      setSelectedTest(detailCard)
      setTests((items) => items.map((item) => (item.id === detail.id ? detailCard : item)))
      setCurrent(detail)
      setAnswers(detail.status === 'in_progress' ? detail.user_answers || {} : {})
      setStatusMessage('已打开测验详情')
    } catch (err) {
      setError('测验详情暂时无法加载，请稍后重试。')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const loadTests = useCallback(async (preferredId?: number) => {
    setListLoading(true)
    setError('')
    try {
      const response = await ApiAdapter.getTests({ page: 1, page_size: 24 })
      const cards = response.items.map((item, index) => toCard(item, index))
      setTests(cards)
      setTotal(response.total)
      setStatusMessage('测验记录已更新')

      const currentSelection = selectedTestRef.current
      const nextIndex = Math.max(
        0,
        preferredId
          ? cards.findIndex((item) => item.id === preferredId)
          : currentSelection
            ? cards.findIndex((item) => item.id === currentSelection.id)
            : 0
      )
      if (cards[nextIndex]) {
        await openTest(cards[nextIndex], nextIndex)
      } else {
        setSelectedTest(null)
        setCurrent(null)
      }
    } catch (err) {
      setError('测验列表暂时无法加载，请稍后重试。')
    } finally {
      setListLoading(false)
    }
  }, [openTest])

  const createTest = useCallback(async () => {
    const topic = query.trim()
    if (!topic) {
      setError('请输入测验主题后再生成测验。')
      return
    }

    setActionBusy(true)
    setGenerationActive(true)
    setGenerationFailed(false)
    setGenerationTaskId(null)
    setError('')
    try {
      const response = await ApiAdapter.generateTest({
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
      setGenerationTaskId(null)
      setGenerationActive(false)
      setQuery('')
      setStatusMessage('测验已生成')
      await loadTests(response.test_id)
    } catch (err) {
      setGenerationActive(false)
      setGenerationFailed(true)
      setError('测验生成未完成，请检查输入后重试。')
    } finally {
      setActionBusy(false)
    }
  }, [query, selectedDocumentIds, selectedFileIds])

  const completeGeneration = useCallback((resultPayload: Record<string, unknown>, references: Record<string, unknown>[]) => {
    const testId = Number(resultPayload.test_id || 0)
    const resultReferences = Array.isArray(resultPayload.references)
      ? resultPayload.references as Array<Record<string, unknown>>
      : references
    setGenerationSources(resultReferences)
    setGenerationActive(false)
    setQuery('')
    setStatusMessage('测验已生成')
    if (testId > 0) void loadTests(testId)
  }, [loadTests])

  const failGeneration = useCallback((message: string) => {
    setGenerationActive(false)
    setGenerationFailed(true)
    setError('测验生成未完成，请检查输入后重试。')
  }, [])

  const startCurrent = useCallback(async () => {
    if (!current) return
    setActionBusy(true)
    setError('')
    try {
      const detail = await ApiAdapter.startTest(current.id)
      setCurrent(detail)
      setAnswers(detail.user_answers || {})
      setStatusMessage('已进入作答状态')
      setTests((items) => items.map((item, index) => (item.id === detail.id ? toCard(detail, index, detail) : item)))
      setSelectedTest((selected) => (selected && selected.id === detail.id ? toCard(detail, activeIndex, detail) : selected))
    } catch (err) {
      setError('暂时无法开始测验，请稍后重试。')
    } finally {
      setActionBusy(false)
    }
  }, [activeIndex, current])

  const submitCurrent = useCallback(async () => {
    if (!current) return
    setActionBusy(true)
    setError('')
    try {
      const result = await ApiAdapter.submitTest(current.id, { user_answers: answers })
      setSubmitResult(result)
      const detail = await ApiAdapter.getTest(current.id)
      setCurrent(detail)
      setStatusMessage('测验已提交，评分与解析已生成')
      await loadTests(current.id)
    } catch (err) {
      setError('答案暂时无法提交，请稍后重试。')
    } finally {
      setActionBusy(false)
    }
  }, [answers, current, loadTests])

  const updateAnswer = useCallback((question: TestQuestion, value: TestAnswerValue) => {
    setAnswers((previous) => ({ ...previous, [question.id]: value }))
  }, [])

  useEffect(() => {
    loadTests()
  }, [loadTests])

  useEffect(() => {
    void loadEvidence(true)
    const refresh = () => void loadEvidence(true)
    const timer = window.setInterval(() => void loadEvidence(), 4000)
    window.addEventListener('student-test-evidence-updated', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('student-test-evidence-updated', refresh)
    }
  }, [loadEvidence])

  const filteredTests = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return tests.filter((test) => {
      const matchesStatus = activeFilter === 'all' || activeFilter === 'records' || test.status === activeFilter
      const matchesKeyword = !keyword ||
        [test.title, test.course, test.difficulty, test.creator, test.status].some((item) => String(item).toLowerCase().includes(keyword))
      return matchesStatus && matchesKeyword
    })
  }, [activeFilter, tests, query])

  useEffect(() => {
    if (!filteredTests.length) return
    const selectedIndex = selectedTest ? filteredTests.findIndex((test) => test.id === selectedTest.id) : -1
    if (selectedIndex < 0) {
      void openTest(filteredTests[0], 0)
    } else if (activeIndex !== selectedIndex) {
      setActiveIndex(selectedIndex)
    }
  }, [activeIndex, filteredTests, openTest, selectedTest])

  const stats = useMemo(
    () => ({
      total: total || tests.length,
      questions: tests.reduce((sum, test) => sum + test.questionCount, 0),
      score: tests.reduce((sum, test) => sum + test.totalScore, 0),
      duration: tests.reduce((sum, test) => sum + test.duration, 0)
    }),
    [tests, total]
  )

  const handleSelect = useCallback((test: TestCardModel, index: number) => openTest(test, index), [openTest])

  const refreshCurrent = useCallback(() => {
    if (selectedTest) openTest(selectedTest, activeIndex)
  }, [activeIndex, openTest, selectedTest])

  return (
    <main className="page tests-page" data-testid="external-student-tests">
      <TopNav />
      <section className="page-grid student-tests-layout" data-testid="student-tests-layout">
        <div className="workspace-column student-tests-main">
          <header className="page-hero tests-hero-card" data-testid="student-tests-hero">
            <div>
              <h1>我的测验</h1>
              <span>My Tests</span>
              <p>生成、作答、提交并复盘你的全部学习测验与答案解析。</p>
            </div>
            <div className="toolbar-row">
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input value={query} placeholder="搜索或输入新测验主题，例如：Python 函数、机器学习基础" onChange={(event) => setQuery(event.target.value)} />
              </label>
              <button className="refresh-button" type="button" disabled={listLoading || actionBusy} onClick={() => loadTests(selectedTest?.id)}>
                刷新
              </button>
              <button className="add-button" type="button" disabled={actionBusy || generationActive} onClick={createTest}>
                {generationActive ? '生成中...' : actionBusy ? '处理中...' : '生成测验'}
              </button>
            </div>
            {error ? <div className="test-error">{error}</div> : null}
            <section className="test-evidence-panel" aria-label="测验知识来源" data-testid="test-evidence-panel">
              <div className="test-evidence-heading">
                <div>
                  <h2>选择出题知识来源</h2>
                  <p>上传后会自动解析并进入个人知识库；只有就绪资料可用于出题。</p>
                </div>
                <div className="test-evidence-heading-actions">
                  <button type="button" data-testid="test-evidence-upload" onClick={() => window.dispatchEvent(new Event('student-test-upload-open'))}>
                    上传资料
                  </button>
                  <button type="button" disabled={evidenceLoading} data-testid="test-evidence-refresh" onClick={() => void loadEvidence(true)}>
                    {evidenceLoading ? '刷新中…' : '刷新并选择最新就绪资料'}
                  </button>
                </div>
              </div>
              {evidenceError ? <p className="test-evidence-error" role="alert">{evidenceError}</p> : null}
              <div className="test-evidence-scroll" data-testid="test-evidence-file-list">
                <div className="test-evidence-list">
                  {files.map((file) => {
                    const linkedDocument = documents.find((document) => document.id === file.knowledge_document_id || document.file_asset_id === file.id)
                    const selectable = linkedDocument ? linkedDocument.status === 'ingested' : file.parse_status === 'parsed'
                    const checked = linkedDocument ? selectedDocumentIds.includes(linkedDocument.id) : selectedFileIds.includes(file.id)
                    const removalKey = `${file.id}-${linkedDocument?.id || 0}`
                    return <label key={file.id} className={selectable ? 'is-ready' : ''}>
                      <input
                        type="checkbox"
                        disabled={!selectable || Boolean(removingEvidenceKey)}
                        checked={checked}
                        onChange={(event) => {
                          if (linkedDocument) {
                            setSelectedDocumentIds((ids) => event.target.checked ? [...ids, linkedDocument.id] : ids.filter((id) => id !== linkedDocument.id))
                          } else {
                            setSelectedFileIds((ids) => event.target.checked ? [...ids, file.id] : ids.filter((id) => id !== file.id))
                          }
                        }}
                      />
                      <span>
                        <strong title={file.original_filename}>{file.original_filename}</strong>
                        <small>
                          <em data-status={file.parse_status}>解析：{fileParseStatusText(file.parse_status)}</em>
                          <em data-status={linkedDocument?.status || file.knowledge_ingest_status || 'not_started'}>
                            入库：{linkedDocument ? documentStatusText(linkedDocument.status) : ingestStatusText(file.knowledge_ingest_status)}
                            {linkedDocument ? ` · ${linkedDocument.chunk_count} 个分块` : ''}
                          </em>
                        </small>
                        {file.parse_error ? <b title={file.parse_error}>{file.parse_error}</b> : null}
                      </span>
                      <button
                        className="test-evidence-remove"
                        disabled={Boolean(removingEvidenceKey)}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void removeEvidence(file, linkedDocument)
                        }}
                      >
                        {removingEvidenceKey === removalKey ? '移除中…' : '移除'}
                      </button>
                    </label>
                  })}
                </div>
                <div className="test-evidence-list test-document-list">
                  {documents.filter((document) => !files.some((file) => file.knowledge_document_id === document.id || document.file_asset_id === file.id)).map((document) => <label key={document.id} className={document.status === 'ingested' ? 'is-ready' : ''}>
                    <input type="checkbox" disabled={document.status !== 'ingested' || Boolean(removingEvidenceKey)} checked={selectedDocumentIds.includes(document.id)} onChange={(event) => setSelectedDocumentIds((ids) => event.target.checked ? [...ids, document.id] : ids.filter((id) => id !== document.id))} />
                    <span>
                      <strong title={document.title}>{document.title}</strong>
                      <small><em data-status={document.status}>知识库：{documentStatusText(document.status)} · {document.chunk_count} 个分块</em></small>
                    </span>
                    <button
                      className="test-evidence-remove"
                      disabled={Boolean(removingEvidenceKey)}
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void removeEvidence(undefined, document)
                      }}
                    >
                      {removingEvidenceKey === `0-${document.id}` ? '移除中…' : '移除'}
                    </button>
                  </label>)}
                </div>
              </div>
              {!files.length && !documents.length ? <p>尚未上传个人资料。请在上方批量上传，系统会自动解析并入库。</p> : null}
              {!selectedFileIds.length && !selectedDocumentIds.length ? <p role="status">本次测验未使用个人知识库，无法计算来源覆盖率。</p> : null}
              {generationSources.length ? <p className="test-evidence-used">本次实际使用 {generationSources.length} 条知识来源。</p> : null}
            </section>
          </header>

          {generationTaskId ? (
            <TaskStreamPanel
              key={generationTaskId}
              taskId={generationTaskId}
              title={query.trim() || 'AI 学习测验'}
              variant="student"
              dataTestId="student-test-generation-progress"
              onCompleted={completeGeneration}
              onFailed={failGeneration}
            />
          ) : (
            <GenerationProgress
              visible={simulatedProgress.visible}
              title={query.trim() || 'AI 学习测验'}
              subtitle="准备出题任务"
              statusText={generationFailed ? '测验生成未完成，请检查输入后重试。' : '正在分析主题与知识来源。'}
              percent={simulatedProgress.percent}
              state={simulatedProgress.state}
              variant="student"
              dataTestId="student-test-generation-progress"
            />
          )}

          <nav className="tests-filter-tabs" aria-label="测验筛选" data-testid="student-test-filter-tabs">
            {([
              ['all', '全部测验', tests.length],
              ['generated', '待开始', tests.filter((test) => test.status === 'generated').length],
              ['in_progress', '作答中', tests.filter((test) => test.status === 'in_progress').length],
              ['submitted', '已提交', tests.filter((test) => test.status === 'submitted').length],
              ['records', '总记录', total]
            ] as Array<[TestFilter, string, number]>).map(([filter, label, count]) => (
              <button
                className={activeFilter === filter ? 'is-active' : ''}
                data-filter={filter}
                data-testid={`test-filter-${filter}`}
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
              >
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </nav>

          <section className="tests-list" aria-label="测验列表" data-testid="student-tests-list">
            {listLoading ? (
              <div className="test-empty-state">正在加载测验列表</div>
            ) : filteredTests.length ? (
              filteredTests.map((test, index) => (
                <article
                  aria-label={`查看测验：${test.title}`}
                  className={`tests-list-item ${selectedTest?.id === test.id ? 'is-selected' : ''}`}
                  data-status={test.status}
                  data-test-id={test.id}
                  data-testid="student-test-list-item"
                  key={test.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(test, index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      handleSelect(test, index)
                    }
                  }}
                >
                  <div className="test-list-thumbnail" aria-hidden="true">
                    <span className="test-list-crystal" />
                    <span className="test-list-orbit" />
                  </div>
                  <div className="test-list-content">
                    <div className="test-list-heading">
                      <span className="test-course">{test.course}</span>
                      <span className={`test-status test-status--${test.status}`}>{testStatusText(test.status)}</span>
                    </div>
                    <h3 title={test.title}>{test.title}</h3>
                    <p>{testStatusText(test.status)} · {test.difficulty} · {test.questionCount} 题</p>
                    <div className="test-list-metrics">
                      <span><strong>{test.questionCount}</strong>题目数</span>
                      <span><strong>{test.totalScore}</strong>总分值</span>
                      <span><strong>{test.duration}</strong>分钟</span>
                    </div>
                    <small>更新于 {test.updatedAt}</small>
                  </div>
                  <span className="test-list-arrow" aria-hidden="true">›</span>
                </article>
              ))
            ) : (
              <div className="test-empty-state">当前筛选下暂无测验记录，可以切换状态或输入主题生成测验。</div>
            )}
          </section>
        </div>

        <aside className={`side-column student-tests-side${selectedTest ? '' : ' is-empty'}`}>
          <div className="stats-panel tests-stats-card" data-testid="student-tests-stats">
            <span>
              <strong>{stats.total}</strong>
              测验总数
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
            onRefresh={refreshCurrent}
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

function testStatusText(status: string) {
  return ({ generated: '待开始', in_progress: '作答中', submitted: '已提交', cancelled: '已取消' } as Record<string, string>)[status] || status
}
