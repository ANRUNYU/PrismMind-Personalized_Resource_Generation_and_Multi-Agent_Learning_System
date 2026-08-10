import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import gsap from 'gsap'

import {
  buildDownloadText,
  completeExternalResource,
  deleteExternalResource,
  difficultyText,
  externalResourceTypes,
  fetchReadyKnowledgeDocuments,
  fetchExternalResourceDetail,
  fetchExternalResources,
  generateExternalResourcesAsync,
  normalizeExternalError,
  rateExternalResource,
  regenerateExternalResource,
  type ExternalLearningResource,
  type ExternalResourceStatus,
  type ExternalResourceType,
  type GenerateExternalResourcesResult
} from './api'
import type { KnowledgeDocument } from '@/api/knowledge'
import { GenerationProgress, useSimulatedGenerationProgress } from '@/external/shared/GenerationProgress'
import KnowledgeDocumentMultiSelect from '@/external/shared/KnowledgeDocumentMultiSelect'
import { useTaskStream } from '@/external/shared/useTaskStream'
import SafeMarkdown from '@/external/shared/SafeMarkdown'
import PrismBackground from './components/PrismBackground/PrismBackground'
import TopNav from './components/TopNav/TopNav.jsx'
import './ResourceCenterPage.css'
import './components/PrismBackground/PrismBackground.css'
import './components/ResourceCenter/ResourceGeneratorPanel.css'
import './components/ResourceCenter/ResourceTypeSelector.css'
import './components/ResourceCenter/ResourceListPanel.css'
import './ExternalStudentResources.css'

type StatusFilter = '' | 'active' | 'completed'

const ACTIONS = ['查看', '删除', '下载', '重新生成'] as const
const DEFAULT_TYPES: ExternalResourceType[] = ['课程文档', '练习题']

export default function ExternalStudentResources() {
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal')
  const [knowledgePoints, setKnowledgePoints] = useState('')
  const [additionalRequirements, setAdditionalRequirements] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<ExternalResourceType[]>(DEFAULT_TYPES)
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([])
  const [selectedKnowledgeDocumentIds, setSelectedKnowledgeDocumentIds] = useState<number[]>([])
  const [isLoadingKnowledgeDocuments, setIsLoadingKnowledgeDocuments] = useState(true)
  const [knowledgeDocumentsError, setKnowledgeDocumentsError] = useState('')
  const [resources, setResources] = useState<ExternalLearningResource[]>([])
  const [selectedResource, setSelectedResource] = useState<ExternalLearningResource | null>(null)
  const [lastGeneration, setLastGeneration] = useState<GenerateExternalResourcesResult | null>(null)
  const [searchText, setSearchText] = useState('')
  const [typeFilter, setTypeFilter] = useState<ExternalResourceType | ''>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [isLoadingResources, setIsLoadingResources] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [generationFailed, setGenerationFailed] = useState(false)
  const pageRef = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLElement | null>(null)
  const generatorWrapRef = useRef<HTMLDivElement | null>(null)
  const listWrapRef = useRef<HTMLElement | null>(null)
  const ambientRef = useRef<HTMLDivElement | null>(null)
  const { task, error: taskStreamError, warnings: taskWarnings } = useTaskStream(taskId)
  const simulatedProgress = useSimulatedGenerationProgress({
    active: isGenerating && !taskId,
    failed: generationFailed,
    resetKey: taskId || topic
  })

  useEffect(() => {
    if (!task) return
    setIsGenerating(task.status !== 'success' && task.status !== 'failed')
    setStatusMessage(task.status_message || `${task.current_stage || 'queued'} · ${task.progress}%`)
    if (task.status === 'failed') {
      setGenerationFailed(true)
      setErrorMessage('资源生成未完成，请检查输入后重试。')
    }
    if (task.status === 'success') {
      const ids = Array.isArray(task.result_payload?.resource_ids)
        ? task.result_payload.resource_ids.filter((value): value is number => typeof value === 'number')
        : []
      void loadResources().then(() => {
        if (ids[0]) window.location.assign(`/student/resources/${ids[0]}`)
      })
    }
  }, [task?.status, task?.progress])

  useEffect(() => {
    if (taskStreamError) setStatusMessage('实时连接已切换为后台同步，资源仍在生成。')
  }, [taskStreamError])

  const completedCount = useMemo(() => resources.filter((resource) => resource.completed).length, [resources])
  const viewedCount = useMemo(() => resources.filter((resource) => resource.viewed && !resource.completed).length, [resources])
  const activeCount = useMemo(() => resources.filter((resource) => !resource.completed).length, [resources])

  async function loadResources() {
    setIsLoadingResources(true)
    setErrorMessage('')
    try {
      const response = await fetchExternalResources({
        page: 1,
        pageSize: 30,
        topic: searchText.trim(),
        externalType: typeFilter,
        status: statusFilter
      })
      setResources(response.resources)
      setStatusMessage(response.total ? `已同步 ${response.total} 条学习资源` : '暂无学习资源，可以先生成个性化资源')
    } catch (error) {
      setErrorMessage(normalizeExternalError(error, '学习资源加载失败，请稍后重试'))
    } finally {
      setIsLoadingResources(false)
    }
  }

  async function loadKnowledgeDocuments(selectLatestReady = false, preferredDocumentId?: number | null) {
    setIsLoadingKnowledgeDocuments(true)
    setKnowledgeDocumentsError('')
    try {
      const documents = await fetchReadyKnowledgeDocuments()
      const readyIds = new Set(documents.map((document) => document.id))
      setKnowledgeDocuments(documents)
      setSelectedKnowledgeDocumentIds((ids) => {
        const validIds = ids.filter((id) => readyIds.has(id))
        const latestReadyId = preferredDocumentId && readyIds.has(preferredDocumentId)
          ? preferredDocumentId
          : selectLatestReady
            ? documents[0]?.id
            : undefined
        return latestReadyId && !validIds.includes(latestReadyId) ? [...validIds, latestReadyId] : validIds
      })
    } catch (error) {
      setKnowledgeDocumentsError(normalizeExternalError(error, '知识库文件加载失败'))
    } finally {
      setIsLoadingKnowledgeDocuments(false)
    }
  }

  useEffect(() => {
    void loadResources()
    void loadKnowledgeDocuments()
    const handleKnowledgeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ knowledge_document_id?: number | null; knowledge_ingest_status?: string | null }>).detail
      const isReady = detail?.knowledge_ingest_status === 'ingested'
      void loadKnowledgeDocuments(isReady, detail?.knowledge_document_id)
    }
    window.addEventListener('student-resource-knowledge-updated', handleKnowledgeUpdated)
    return () => window.removeEventListener('student-resource-knowledge-updated', handleKnowledgeUpdated)
  }, [])

  useEffect(() => {
    const mm = gsap.matchMedia()

    mm.add(
      {
        reduceMotion: '(prefers-reduced-motion: reduce)',
        allowMotion: '(prefers-reduced-motion: no-preference)'
      },
      (context) => {
        if (context.conditions?.reduceMotion) {
          gsap.set([titleRef.current, generatorWrapRef.current, listWrapRef.current, ambientRef.current], { autoAlpha: 1 })
          return
        }

        gsap.fromTo(ambientRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.1, delay: 0.1, ease: 'power2.out' })
        gsap.fromTo(titleRef.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.82, delay: 0.14, ease: 'power3.out' })
        gsap.fromTo(
          [generatorWrapRef.current, listWrapRef.current],
          { autoAlpha: 0, y: 18, scale: 0.992 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.9, delay: 0.28, stagger: 0.12, ease: 'power3.out' }
        )
      },
      pageRef
    )

    return () => mm.revert()
  }, [])

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanTopic = topic.trim()

    if (!cleanTopic) {
      setStatusMessage('请输入学习主题后再开始生成')
      return
    }

    if (selectedTypes.length === 0) {
      setStatusMessage('请至少选择一种资源类型')
      return
    }

    setIsGenerating(true)
    setGenerationFailed(false)
    setTaskId(null)
    setErrorMessage('')
    setStatusMessage('正在生成个性化资源...')
    try {
      const result = await generateExternalResourcesAsync({
        topic: cleanTopic,
        resourceTypes: selectedTypes,
        difficulty,
        knowledgePoints: splitLines(knowledgePoints),
        knowledgeDocumentIds: selectedKnowledgeDocumentIds,
        additionalRequirements
      })
      setTaskId(result.task_id)
      setStatusMessage('异步生成任务已提交，正在连接实时进度')
    } catch (error) {
      setGenerationFailed(true)
      setIsGenerating(false)
      setErrorMessage('资源生成未完成，请检查输入后重试。')
      setStatusMessage('资源生成未完成，请检查输入后重试。')
    }
  }

  async function handleGenerateAsync() {
    const cleanTopic = topic.trim()
    if (!cleanTopic) {
      setStatusMessage('请输入学习主题后再提交异步生成')
      return
    }
    if (selectedTypes.length === 0) {
      setStatusMessage('请至少选择一种资源类型')
      return
    }
    setIsGenerating(true)
    setGenerationFailed(false)
    setTaskId(null)
    setErrorMessage('')
    try {
      const task = await generateExternalResourcesAsync({
        topic: cleanTopic,
        resourceTypes: selectedTypes,
        difficulty,
        knowledgePoints: splitLines(knowledgePoints),
        knowledgeDocumentIds: selectedKnowledgeDocumentIds,
        additionalRequirements
      })
      setTaskId(task.task_id)
      setStatusMessage('异步生成任务已提交，正在连接实时进度')
    } catch (error) {
      setGenerationFailed(true)
      setErrorMessage('资源生成未完成，请检查输入后重试。')
      setStatusMessage('资源生成未完成，请检查输入后重试。')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleOpen(resource: ExternalLearningResource) {
    window.location.assign(`/student/resources/${resource.id}`)
  }

  async function handleComplete(resource: ExternalLearningResource) {
    setErrorMessage('')
    try {
      const updated = await completeExternalResource(resource)
      setResources((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedResource((current) => (current?.id === updated.id ? updated : current))
      setStatusMessage(`已标记完成：${updated.title}`)
    } catch (error) {
      setErrorMessage(normalizeExternalError(error, '标记完成失败'))
    }
  }

  async function handleRate(resource: ExternalLearningResource, rating: number) {
    setErrorMessage('')
    try {
      const updated = await rateExternalResource(resource, rating)
      setResources((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setSelectedResource((current) => (current?.id === updated.id ? updated : current))
      setStatusMessage(`已评分：${updated.title} · ${rating} 星`)
    } catch (error) {
      setErrorMessage(normalizeExternalError(error, '评分失败'))
    }
  }

  async function handleRegenerate(resource: ExternalLearningResource) {
    setIsGenerating(true)
    setGenerationFailed(false)
    setTaskId(null)
    setErrorMessage('')
    setStatusMessage(`正在基于「${resource.title}」重新生成资源...`)
    try {
      const result = await regenerateExternalResource(resource, selectedKnowledgeDocumentIds)
      setTaskId(result.task_id)
      setStatusMessage('重新生成任务已提交，正在连接实时进度')
    } catch (error) {
      setGenerationFailed(true)
      setIsGenerating(false)
      setErrorMessage('资源重新生成未完成，请稍后重试。')
    }
  }

  async function handleDownload(resource: ExternalLearningResource) {
    setErrorMessage('')
    try {
      const detail = resource.content ? resource : await fetchExternalResourceDetail(resource.id)
      const blob = new Blob([buildDownloadText(detail)], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${sanitizeFilename(detail.title)}.md`
      link.click()
      URL.revokeObjectURL(url)
      setStatusMessage(`已准备下载文件：${detail.title}`)
    } catch (error) {
      setErrorMessage(normalizeExternalError(error, '资源下载失败'))
    }
  }

  async function handleDelete(resource: ExternalLearningResource) {
    const confirmed = window.confirm(`确认删除“${resource.title}”吗？删除后无法恢复。`)
    if (!confirmed) return

    setErrorMessage('')
    try {
      await deleteExternalResource(resource.id)
      setResources((current) => current.filter((item) => item.id !== resource.id))
      setSelectedResource((current) => (current?.id === resource.id ? null : current))
      setStatusMessage(`已删除资源：${resource.title}`)
    } catch (error) {
      setErrorMessage(normalizeExternalError(error, '删除学习资源失败'))
    }
  }

  function handleAction(action: (typeof ACTIONS)[number], resource: ExternalLearningResource) {
    if (action === '查看') void handleOpen(resource)
    if (action === '删除') void handleDelete(resource)
    if (action === '下载') void handleDownload(resource)
    if (action === '重新生成') void handleRegenerate(resource)
  }

  return (
    <main className="resource-center-page" data-testid="external-student-resources" ref={pageRef}>
      <TopNav />
      <PrismBackground />
      <div className="resource-page-grid">
        <div className="resource-hud-line resource-hud-line-top" aria-hidden="true" />
        <div className="resource-hud-line resource-hud-line-bottom" aria-hidden="true" />
        <div className="resource-ambient-layer" ref={ambientRef} aria-hidden="true">
          <div className="resource-orbit-field" />
          <div className="resource-flow-link">
            <span />
            <span />
            <span />
          </div>
          <div className="resource-archive-dots" />
        </div>

        <section className="resource-main-column">
          <header className="resource-hero-copy" ref={titleRef}>
            <span className="resource-kicker">资源中心</span>
            <span className="resource-microcopy">个性化学习资源生成</span>
          </header>

          <div ref={generatorWrapRef}>
            <ResourceGeneratorPanel
              topic={topic}
              selectedTypes={selectedTypes}
              knowledgeDocuments={knowledgeDocuments}
              selectedKnowledgeDocumentIds={selectedKnowledgeDocumentIds}
              isLoadingKnowledgeDocuments={isLoadingKnowledgeDocuments}
              knowledgeDocumentsError={knowledgeDocumentsError}
              isGenerating={isGenerating}
              statusMessage={statusMessage}
              errorMessage={errorMessage}
              onTopicChange={setTopic}
              onTypesChange={setSelectedTypes}
              onKnowledgeDocumentIdsChange={setSelectedKnowledgeDocumentIds}
              onRefreshKnowledgeDocuments={() => loadKnowledgeDocuments(true)}
              onGenerate={handleGenerate}
            />
          </div>

          <GenerationResult result={lastGeneration} onOpen={setSelectedResource} />
        </section>

        <section className="resource-side-column" ref={listWrapRef}>
          <ResourceListPanel
            resources={resources}
            isLoading={isLoadingResources}
            activeCount={activeCount}
            viewedCount={viewedCount}
            completedCount={completedCount}
            searchText={searchText}
            typeFilter={typeFilter}
            statusFilter={statusFilter}
            onSearchTextChange={setSearchText}
            onTypeFilterChange={setTypeFilter}
            onStatusFilterChange={setStatusFilter}
            onSearch={loadResources}
            onRefresh={loadResources}
            onAction={handleAction}
            generationProgress={task ? (
              <GenerationProgress
                visible
                title={topic.trim() || '个性化学习资源'}
                subtitle={taskStageLabel(task.current_stage)}
                statusText={task.status === 'failed'
                  ? '资源生成未完成，请检查输入后重试。'
                  : task.status === 'success'
                    ? '资源生成完成，正在打开详情。'
                    : task.status_message || '正在整合学习资料。'}
                percent={task.status === 'success' ? 100 : task.progress}
                state={task.status === 'success' ? 'success' : task.status === 'failed' ? 'error' : 'running'}
                variant="compact"
                dataTestId="resource-task-progress"
              >
                {taskWarnings.map((warning) => <p className="resource-inline-warning" key={warning}>{warning}</p>)}
              </GenerationProgress>
            ) : (
              <GenerationProgress
                visible={simulatedProgress.visible}
                title={topic.trim() || '个性化学习资源'}
                subtitle="准备生成任务"
                statusText={generationFailed ? '资源生成未完成，请检查输入后重试。' : statusMessage}
                percent={simulatedProgress.percent}
                state={simulatedProgress.state}
                variant="compact"
                dataTestId="resource-task-progress"
              />
            )}
          />
        </section>
      </div>
      <ResourceDetailDrawer resource={selectedResource} isLoading={isDetailLoading} onClose={() => setSelectedResource(null)} onComplete={handleComplete} onRate={handleRate} />
    </main>
  )
}

function ResourceGeneratorPanel({
  topic,
  selectedTypes,
  knowledgeDocuments,
  selectedKnowledgeDocumentIds,
  isLoadingKnowledgeDocuments,
  knowledgeDocumentsError,
  isGenerating,
  statusMessage,
  errorMessage,
  onTopicChange,
  onTypesChange,
  onKnowledgeDocumentIdsChange,
  onRefreshKnowledgeDocuments,
  onGenerate
}: {
  topic: string
  selectedTypes: ExternalResourceType[]
  knowledgeDocuments: KnowledgeDocument[]
  selectedKnowledgeDocumentIds: number[]
  isLoadingKnowledgeDocuments: boolean
  knowledgeDocumentsError: string
  isGenerating: boolean
  statusMessage: string
  errorMessage: string
  onTopicChange: (value: string) => void
  onTypesChange: (value: ExternalResourceType[]) => void
  onKnowledgeDocumentIdsChange: (value: number[]) => void
  onRefreshKnowledgeDocuments: () => void
  onGenerate: (event: FormEvent<HTMLFormElement>) => void
}) {
  const status = statusSignal(errorMessage || statusMessage, isGenerating)

  return (
    <section className="resource-generator-panel hud-panel" aria-label="资源生成主面板">
      <div className="generator-core-rings" aria-hidden="true" />
      <header className="resource-panel-header">
        <div>
          <span className="resource-panel-title">生成节点</span>
          <span className="resource-panel-subtitle">个性化资源合成</span>
        </div>
        <span className={`generator-status-dot${isGenerating ? ' is-breathing' : ''}`} aria-hidden="true" />
      </header>

      <form className="resource-generator-form" onSubmit={onGenerate}>
        <label className="resource-field">
          <span className="resource-field-label">学习主题</span>
          <div className="topic-input-shell">
            <span className="topic-input-prefix" aria-hidden="true">
              主题 / &gt;
            </span>
            <input
              aria-label="学习主题"
              value={topic}
              disabled={isGenerating}
              placeholder="例如：过拟合与正则化"
              onChange={(event) => onTopicChange(event.target.value)}
            />
            <span className="topic-input-scan" aria-hidden="true" />
          </div>
        </label>

        <div className="resource-field">
          <div className="resource-field-row">
            <span className="resource-field-label">资源类型</span>
            <span className="resource-selection-count">资源类型 / 8 项 • 已选择 / {selectedTypes.length}</span>
          </div>
          <ResourceTypeSelector selectedTypes={selectedTypes} disabled={isGenerating} onChange={onTypesChange} />
        </div>

        <KnowledgeSourceSelector
          documents={knowledgeDocuments}
          selectedDocumentIds={selectedKnowledgeDocumentIds}
          isLoading={isLoadingKnowledgeDocuments}
          errorMessage={knowledgeDocumentsError}
          disabled={isGenerating}
          onChange={onKnowledgeDocumentIdsChange}
          onRefresh={onRefreshKnowledgeDocuments}
        />

        <div className="resource-generate-row">
          <button className="resource-generate-button" type="submit" aria-label="生成资源" disabled={isGenerating}>
            <span className="resource-generate-label">{isGenerating ? '生成中' : '开始生成'}</span>
            <span className="button-scan" aria-hidden="true" />
          </button>
          <div className={`resource-status-console ${status.className}`} aria-live="polite">
            <span>{status.label}</span>
            <strong>{status.text}</strong>
          </div>
        </div>
      </form>
    </section>
  )
}

function KnowledgeSourceSelector({
  documents,
  selectedDocumentIds,
  isLoading,
  errorMessage,
  disabled,
  onChange,
  onRefresh
}: {
  documents: KnowledgeDocument[]
  selectedDocumentIds: number[]
  isLoading: boolean
  errorMessage: string
  disabled: boolean
  onChange: (value: number[]) => void
  onRefresh: () => void
}) {
  return (
    <div className="resource-field resource-knowledge-field" data-testid="resource-knowledge-source-selector">
      <span className="resource-field-label">选择生成知识来源（支持多选）</span>
      {errorMessage ? <p className="resource-knowledge-error" role="alert">{errorMessage}</p> : null}
      <KnowledgeDocumentMultiSelect
        documents={documents}
        selectedIds={selectedDocumentIds}
        disabled={disabled}
        loading={isLoading}
        emptyText="暂无已入库文件，可先在知识库或测验页面上传资料。"
        onChange={onChange}
      />
      <div className="resource-knowledge-actions">
        <button type="button" disabled={disabled} onClick={() => window.dispatchEvent(new Event('student-resource-upload-open'))}>上传资料</button>
        {selectedDocumentIds.length ? <button type="button" disabled={disabled} onClick={() => onChange([])}>清空</button> : null}
        <button type="button" disabled={disabled || isLoading} onClick={onRefresh}>{isLoading ? '刷新中…' : '刷新并选择最新就绪资料'}</button>
      </div>
    </div>
  )
}

function ResourceTypeSelector({ selectedTypes, disabled, onChange }: { selectedTypes: ExternalResourceType[]; disabled: boolean; onChange: (value: ExternalResourceType[]) => void }) {
  function toggleType(type: ExternalResourceType) {
    if (disabled) return
    if (selectedTypes.includes(type)) {
      onChange(selectedTypes.filter((selectedType) => selectedType !== type))
      return
    }
    onChange([...selectedTypes, type])
  }

  return (
    <div className="resource-type-grid" aria-label="资源类型多选">
      {externalResourceTypes.map((type, index) => {
        const isSelected = selectedTypes.includes(type)
        return (
          <button key={type} className={`resource-type-chip${isSelected ? ' is-selected' : ''}`} type="button" aria-pressed={isSelected} disabled={disabled} onClick={() => toggleType(type)}>
            <span className="resource-type-index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="resource-type-dot" aria-hidden="true" />
            <span className="resource-type-name">{type}</span>
            <span className="resource-type-marker" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

function ResourceListPanel({
  resources,
  isLoading,
  activeCount,
  viewedCount,
  completedCount,
  searchText,
  typeFilter,
  statusFilter,
  onSearchTextChange,
  onTypeFilterChange,
  onStatusFilterChange,
  onSearch,
  onRefresh,
  onAction,
  generationProgress
}: {
  resources: ExternalLearningResource[]
  isLoading: boolean
  activeCount: number
  viewedCount: number
  completedCount: number
  searchText: string
  typeFilter: ExternalResourceType | ''
  statusFilter: StatusFilter
  onSearchTextChange: (value: string) => void
  onTypeFilterChange: (value: ExternalResourceType | '') => void
  onStatusFilterChange: (value: StatusFilter) => void
  onSearch: () => void
  onRefresh: () => void
  onAction: (action: (typeof ACTIONS)[number], resource: ExternalLearningResource) => void
  generationProgress?: ReactNode
}) {
  const itemRefs = useRef<Array<HTMLElement | null>>([])
  const lastFirstResourceId = useRef<number | null>(null)

  useEffect(() => {
    if (!resources[0] || lastFirstResourceId.current === resources[0].id) return
    lastFirstResourceId.current = resources[0].id
    if (itemRefs.current[0]) {
      gsap.fromTo(itemRefs.current[0], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: 'power2.out' })
    }
  }, [resources])

  return (
    <aside className={`resource-list-panel hud-panel${generationProgress ? ' has-generation-progress' : ''}`} aria-label="已生成资源管理面板">
      <header className="resource-list-header">
        <div>
          <span className="resource-list-title">已生成资源</span>
          <span className="resource-list-subtitle">资源归档与任务状态</span>
        </div>
        <span className="resource-count-pill">
          <i aria-hidden="true" />
          {resources.length} 项资源
        </span>
      </header>

      <div className="resource-stats-strip" aria-label="资源统计">
        <span>
          <strong>{activeCount}</strong>
          <em>学习中</em>
        </span>
        <span>
          <strong>{viewedCount}</strong>
          <em>已查看</em>
        </span>
        <span>
          <strong>{completedCount}</strong>
          <em>已完成</em>
        </span>
      </div>

      <div className="resource-filter-bar">
        <input value={searchText} placeholder="搜索主题或标题" onChange={(event) => onSearchTextChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSearch()} />
        <select value={typeFilter} onChange={(event) => onTypeFilterChange(event.target.value as ExternalResourceType | '')}>
          <option value="">全部类型</option>
          {externalResourceTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}>
          <option value="">全部状态</option>
          <option value="active">学习中</option>
          <option value="completed">已完成</option>
        </select>
        <button type="button" onClick={onSearch}>
          搜索
        </button>
        <button type="button" onClick={onRefresh}>
          刷新
        </button>
      </div>

      {generationProgress}

      <div className="resource-list-scroll">
        {isLoading ? (
          <div className="resource-empty-state" data-testid="external-loading">
            正在同步资源列表...
          </div>
        ) : null}
        {!isLoading && resources.length === 0 ? (
          <div className="resource-empty-state">
            <span>暂无学习资源</span>
            <small>暂无学习资源，可以先生成个性化资源</small>
          </div>
        ) : null}
        {!isLoading
          ? resources.map((resource, index) => (
              <article
                className={`resource-item ${statusClass(resource.status)}`}
                key={resource.id}
                data-resource-id={resource.id}
                ref={(node) => {
                  itemRefs.current[index] = node
                }}
              >
                <span className="resource-item-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="resource-item-main">
                  <span className="resource-item-title">{resource.title}</span>
                  <div className="resource-item-meta">
                    <span>{resource.type}</span>
                    <span>{difficultyText(resource.difficulty)}</span>
                    <span>{resource.createdAt}</span>
                    <span className={`resource-status-badge ${statusClass(resource.status)}`}>{resource.status}</span>
                  </div>
                </div>
                <div className="resource-action-row" aria-label={`${resource.title} 操作`}>
                  {ACTIONS.map((action) => (
                    <button key={action} className={`resource-action-button action-${actionName(action)}`} type="button" onClick={() => onAction(action, resource)}>
                      {action}
                    </button>
                  ))}
                </div>
              </article>
            ))
          : null}
      </div>

      <footer className="resource-list-footer">
        <span>{new Date().toLocaleString('zh-CN', { hour12: false })}</span>
        <span>学习资源库已就绪</span>
      </footer>
    </aside>
  )
}

function GenerationResult({ result, onOpen }: { result: GenerateExternalResourcesResult | null; onOpen: (resource: ExternalLearningResource) => void }) {
  if (!result) return null
  return (
    <section className="resource-generation-result hud-panel" aria-label="最新生成结果">
      <header className="resource-list-header">
        <div>
          <span className="resource-list-title">最新生成</span>
          <span className="resource-list-subtitle">最新生成结果、引用与提醒</span>
        </div>
      </header>
      {result.warnings.map((warning) => (
        <p className="resource-inline-warning" key={warning}>
          {warning}
        </p>
      ))}
      <div className="resource-result-grid">
        {result.resources.map((resource) => (
          <button className="resource-result-card" type="button" key={resource.id} onClick={() => onOpen(resource)}>
            <strong>{resource.title}</strong>
            <span>{resource.content.slice(0, 120) || '点击查看资源详情'}</span>
          </button>
        ))}
      </div>
      {result.references.length ? (
        <div className="resource-reference-strip">
          {result.references.map((reference, index) => (
            <p key={`${reference.document_id || index}-${reference.chunk_index || 0}`}>
              {reference.source_filename || '知识库引用'}：{reference.excerpt || '已返回引用片段'}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ResourceDetailDrawer({
  resource,
  isLoading,
  onClose,
  onComplete,
  onRate
}: {
  resource: ExternalLearningResource | null
  isLoading: boolean
  onClose: () => void
  onComplete: (resource: ExternalLearningResource) => void
  onRate: (resource: ExternalLearningResource, rating: number) => void
}) {
  if (!resource && !isLoading) return null
  return (
    <aside className="resource-detail-drawer hud-panel" aria-label="资源详情">
      <header className="resource-list-header">
        <div>
          <span className="resource-list-title">资源详情</span>
          <span className="resource-list-subtitle">学习资源内容</span>
        </div>
        <button className="resource-detail-close" type="button" onClick={onClose}>
          关闭
        </button>
      </header>
      {isLoading ? <div className="resource-empty-state">正在加载资源详情...</div> : null}
      {resource ? (
        <div className="resource-detail-body">
          <h2>{resource.title}</h2>
          <div className="resource-item-meta">
            <span>{resource.type}</span>
            <span>{difficultyText(resource.difficulty)}</span>
            <span>{resource.status}</span>
            <span>{resource.rating ? `${resource.rating} 星` : '未评分'}</span>
          </div>
          <div className="resource-detail-tags">
            {resource.tags.length ? resource.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>暂无标签</span>}
          </div>
          <SafeMarkdown content={resource.content || '暂无资源正文。'} className="resource-detail-content" />
          <div className="resource-action-row">
            <button type="button" disabled={resource.completed} onClick={() => onComplete(resource)}>
              {resource.completed ? '已完成' : '标记完成'}
            </button>
            {[1, 2, 3, 4, 5].map((rating) => (
              <button key={rating} type="button" aria-label={`详情${rating}星`} onClick={() => onRate(resource, rating)}>
                {rating}星
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

function statusSignal(message: string, isGenerating: boolean) {
  if (isGenerating) {
    return { className: 'is-generating', label: '生成中', text: '正在生成个性化资源...' }
  }
  if (message.includes('失败') || message.includes('异常') || message.includes('无权')) {
    return { className: 'is-error', label: '异常', text: message }
  }
  if (message.includes('已生成') || message.includes('已提交') || message.includes('已同步') || message.includes('已评分')) {
    return { className: 'is-complete', label: '完成', text: message }
  }
  return { className: 'is-ready', label: '就绪', text: message || '请输入学习主题并选择资源类型' }
}

function taskStageLabel(stage?: string | null) {
  const labels: Record<string, string> = {
    queued: '等待生成',
    preparing: '准备资料',
    retrieving: '检索知识库',
    generating: '生成资源',
    validating: '校验内容',
    finalizing: '整理资源'
  }
  return labels[String(stage || '').toLowerCase()] || '生成处理中'
}

function statusClass(status: ExternalResourceStatus) {
  if (status === '生成中') return 'is-running'
  if (status === '失败') return 'is-failed'
  return 'is-ready'
}

function actionName(action: string) {
  if (action === '删除') return 'delete'
  if (action === '下载') return 'download'
  if (action === '重新生成') return 'regenerate'
  return 'neutral'
}

function splitLines(value: string) {
  return value
    .split(/[\n,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'learning-resource'
}
