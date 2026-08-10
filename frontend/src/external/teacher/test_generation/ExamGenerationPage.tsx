import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import gsap from 'gsap'
import { GenerationProgress, useSimulatedGenerationProgress } from '../../shared/GenerationProgress'
import { TaskStreamPanel } from '../../shared/TaskStreamPanel'
import SafeMarkdown from '../../shared/SafeMarkdown'
import { TeacherKnowledgeSourceSelector } from '../shared/TeacherKnowledgeSourceSelector'
import { TeacherClassSelector } from '../shared/TeacherClassSelector'

import {
  DEFAULT_QUESTION_DISTRIBUTION,
  createExamPaperFormData,
  fetchMyPapers,
  formatDuration,
  generateExamPaper,
  parseQuestionRows,
  saveExamPaper,
  validateExamPaperForm,
  type ExamPaperFormValues,
  type ExamPaperGenerationResponse,
  type ExamPreparationProgress,
  type PaperHistoryItem,
  type PaperQuestion
} from './examPaperGenerationApi'
import PrismBackground from './PrismBackground'
import ReferenceFilePicker from './ReferenceFilePicker'
import TopNav from './TopNav'

const initialValues: ExamPaperFormValues = {
  courseId: null,
  courseName: '',
  examDuration: '120分钟',
  examScope: '',
  totalScore: '100',
  difficultyRatio: '简单20%，中等60%，困难20%',
  questionDistribution: DEFAULT_QUESTION_DISTRIBUTION,
  referenceDescription: '',
  referenceFile: [],
  knowledgeDocumentIds: []
}

export default function ExamGenerationPage() {
  const [values, setValues] = useState<ExamPaperFormValues>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof ExamPaperFormValues, string>>>({})
  const [warnings, setWarnings] = useState<Partial<Record<keyof ExamPaperFormValues, string>>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [paper, setPaper] = useState<ExamPaperGenerationResponse | null>(null)
  const [historyItems, setHistoryItems] = useState<PaperHistoryItem[]>([])
  const [statusMessage, setStatusMessage] = useState('就绪')
  const [taskId, setTaskId] = useState<number | null>(null)
  const [preparationProgress, setPreparationProgress] = useState<ExamPreparationProgress | null>(null)
  const [generationFailed, setGenerationFailed] = useState(false)

  const pageRef = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLElement | null>(null)
  const formWrapRef = useRef<HTMLElement | null>(null)
  const sideWrapRef = useRef<HTMLElement | null>(null)

  const questionRows = useMemo(() => parseQuestionRows(values.questionDistribution), [values.questionDistribution])
  const questionCount = useMemo(() => getQuestionCount(paper, questionRows), [paper, questionRows])
  const totalScore = Number(paper?.data.totalScore || values.totalScore || 100)
  const previewQuestion = getPreviewQuestion(paper)
  const simulatedProgress = useSimulatedGenerationProgress({
    active: isGenerating && !taskId && !preparationProgress,
    failed: generationFailed,
    resetKey: values.courseName
  })

  useEffect(() => {
    const mm = gsap.matchMedia()

    mm.add(
      {
        reduceMotion: '(prefers-reduced-motion: reduce)',
        allowMotion: '(prefers-reduced-motion: no-preference)'
      },
      (context) => {
        const targets = [titleRef.current, formWrapRef.current, sideWrapRef.current].filter(Boolean)
        const reduceMotion = Boolean(context.conditions?.reduceMotion)

        if (reduceMotion) {
          gsap.set(targets, { autoAlpha: 1 })
          return undefined
        }

        gsap.fromTo(titleRef.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.72, delay: 0.12, ease: 'power3.out' })
        gsap.fromTo(
          [formWrapRef.current, sideWrapRef.current],
          { autoAlpha: 0, y: 18, scale: 0.992 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.82, delay: 0.24, stagger: 0.1, ease: 'power3.out' }
        )
        return undefined
      },
      pageRef
    )

    return () => mm.revert()
  }, [])

  const updateField = <FieldName extends keyof ExamPaperFormValues>(fieldName: FieldName, value: ExamPaperFormValues[FieldName]) => {
    setValues((current) => ({ ...current, [fieldName]: value }))
    setErrors((current) => {
      if (!current[fieldName]) return current
      const next = { ...current }
      delete next[fieldName]
      return next
    })
  }

  const submitExamPaperGeneration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = validateExamPaperForm(values)
    setErrors(validation.errors)
    setWarnings(validation.warnings)

    if (!validation.isValid) {
      setStatusMessage('请先补充必填信息')
      return
    }

    setIsGenerating(true)
    setTaskId(null)
    setPreparationProgress(null)
    setGenerationFailed(false)
    setStatusMessage(validation.warnings.examScope || '正在生成试卷...')

    try {
      const formData = createExamPaperFormData(values)
      const response = await generateExamPaper(formData, (progress) => {
        setPreparationProgress(progress)
        setStatusMessage(progress.message)
      })
      setTaskId(response.task_id)
      setStatusMessage('生成任务已提交，可在当前页面查看实时进度。')
      void loadMyPapers('已同步我的试卷列表')
    } catch (error) {
      setGenerationFailed(true)
      setStatusMessage('试卷生成未完成，请检查输入后重试。')
    } finally {
      setIsGenerating(false)
    }
  }

  const loadMyPapers = async (successMessage = '已同步我的试卷列表') => {
    setIsLoadingHistory(true)
    try {
      const response = await fetchMyPapers()
      setHistoryItems(response.papers)
      setStatusMessage(successMessage)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '试卷历史加载失败。')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const handleSaveStatus = async () => {
    if (!paper) return
    try {
      const result = await saveExamPaper(paper)
      setStatusMessage(result.message)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存状态确认失败。')
    }
  }

  const handleCopy = async () => {
    if (!paper?.content) return
    try {
      await navigator.clipboard.writeText(paper.content)
      setStatusMessage('试卷内容已复制到剪贴板。')
    } catch {
      setStatusMessage('浏览器暂不允许自动复制，请手动选中内容复制。')
    }
  }

  const handleExport = () => {
    if (!paper?.content) return
    const blob = new Blob([paper.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${paper.title || values.courseName || 'prismmind-paper'}.md`
    link.click()
    URL.revokeObjectURL(url)
    setStatusMessage('试卷 Markdown 已导出。')
  }

  return (
    <main
      className="teacher-workbench-page exam-generation-page"
      ref={pageRef}
      data-testid="external-teacher-test-generation"
      data-external-source="Teacher/test_generation"
    >
      <TopNav contextLabel="试卷智能生成工作台" />
      <PrismBackground />

      <div className="workbench-shell">
        <header className="workbench-hero" ref={titleRef}>
          <h1>试卷生成</h1>
          <span className="workbench-subtitle">AI-DRIVEN EXAM PAPER GENERATION</span>
          <p>基于课程内容与知识体系，智能生成结构合理、难度均衡的个性化试卷。</p>
        </header>

        {taskId && (
          <TaskStreamPanel
            taskId={taskId}
            title={values.courseName || '试卷智能生成'}
            onCompleted={() => setStatusMessage('试卷生成完成，结果已就绪。')}
            onFailed={() => setStatusMessage('试卷生成未完成，请检查输入后重试。')}
          />
        )}
        {!taskId && !preparationProgress ? (
          <GenerationProgress
            visible={simulatedProgress.visible}
            title={values.courseName || '试卷智能生成'}
            subtitle="准备生成任务"
            statusText={generationFailed ? '试卷生成未完成，请检查输入后重试。' : statusMessage}
            percent={simulatedProgress.percent}
            state={simulatedProgress.state}
            dataTestId="paper-preparation-progress"
          />
        ) : null}
        {preparationProgress && !taskId ? (
          <GenerationProgress
            visible
            title={values.courseName || '试卷智能生成'}
            subtitle={getPreparationStageLabel(preparationProgress.phase)}
            statusText={generationFailed ? '试卷生成未完成，请检查输入后重试。' : preparationProgress.message}
            percent={generationFailed ? 100 : preparationProgress.percent}
            state={generationFailed ? 'error' : 'running'}
            className="paper-preparation-progress"
            dataTestId="paper-preparation-progress"
          >
            {preparationProgress.files?.length ? (
              <ul>
                {preparationProgress.files.map((file) => (
                  <li key={file.fileId}>
                    <span>{file.fileName}</span>
                    <strong>{getParseStatusLabel(file.parseStatus)}</strong>
                    {file.error ? <small>{file.error}</small> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {preparationProgress.warnings?.map((warning) => <p className="task-warning" key={warning}>{warning}</p>)}
          </GenerationProgress>
        ) : null}
        <section className="workbench-layout">
          <section className="workbench-panel workbench-panel--form" ref={formWrapRef}>
            <div className="panel-heading">
              <div className="panel-title-wrap">
                <span className="panel-icon" aria-hidden="true">
                  <Icon name="paper" />
                </span>
                <div>
                  <h2>试卷配置</h2>
                  <p>课程、范围、题型与分值</p>
                </div>
              </div>
            </div>

            <form className="workbench-form" onSubmit={submitExamPaperGeneration}>
              <div className="field-grid">
                <TeacherClassSelector
                  value={values.courseId}
                  disabled={isGenerating}
                  onChange={(courseId) => updateField('courseId', courseId)}
                />
                <label className={`form-field form-field--wide${errors.courseName ? ' has-error' : ''}`} htmlFor="paperCourseName">
                  <span className="field-label">课程名称</span>
                  <div className="field-control">
                    <input
                      id="paperCourseName"
                      value={values.courseName}
                      onChange={(event) => updateField('courseName', event.target.value)}
                      placeholder="例如：Python编程基础"
                      aria-invalid={Boolean(errors.courseName)}
                    />
                  </div>
                  {errors.courseName ? <p className="form-error">{errors.courseName}</p> : null}
                </label>

                <label className={`form-field${errors.examDuration ? ' has-error' : ''}`} htmlFor="paperExamDuration">
                  <span className="field-label">考试时长</span>
                  <div className="field-control">
                    <input
                      id="paperExamDuration"
                      value={values.examDuration}
                      onChange={(event) => updateField('examDuration', event.target.value)}
                      placeholder="120"
                    />
                    <span className="field-unit">分钟</span>
                  </div>
                  {errors.examDuration ? <p className="form-error">{errors.examDuration}</p> : null}
                </label>

                <label className={`form-field${errors.totalScore ? ' has-error' : ''}`} htmlFor="paperTotalScore">
                  <span className="field-label">试卷总分</span>
                  <div className="field-control">
                    <input
                      id="paperTotalScore"
                      value={values.totalScore}
                      onChange={(event) => updateField('totalScore', event.target.value)}
                      inputMode="numeric"
                      placeholder="100"
                    />
                    <span className="field-unit">分</span>
                  </div>
                  {errors.totalScore ? <p className="form-error">{errors.totalScore}</p> : null}
                </label>

                <label className={`form-field form-field--wide${errors.examScope ? ' has-error' : ''}`} htmlFor="paperExamScope">
                  <span className="field-label">考试范围（知识点 / 章节）</span>
                  <div className="field-control">
                    <textarea
                      id="paperExamScope"
                      value={values.examScope}
                      onChange={(event) => updateField('examScope', event.target.value)}
                      rows={3}
                      placeholder="第1章 Python语言基础；第2章 数据类型与运算；第3章 控制结构；第4章 函数与模块"
                    />
                  </div>
                  {errors.examScope ? <p className="form-error">{errors.examScope}</p> : null}
                  {warnings.examScope ? <p className="field-hint">{warnings.examScope}</p> : null}
                </label>

                <label className={`form-field form-field--wide${errors.difficultyRatio ? ' has-error' : ''}`} htmlFor="paperDifficultyRatio">
                  <span className="field-label">难度比例</span>
                  <div className="field-control">
                    <input
                      id="paperDifficultyRatio"
                      value={values.difficultyRatio}
                      onChange={(event) => updateField('difficultyRatio', event.target.value)}
                      placeholder="简单20%，中等60%，困难20%"
                    />
                  </div>
                  {errors.difficultyRatio ? <p className="form-error">{errors.difficultyRatio}</p> : null}
                </label>

                <label
                  className={`form-field form-field--wide${errors.questionDistribution ? ' has-error' : ''}`}
                  htmlFor="paperQuestionDistribution"
                >
                  <span className="field-label">题型与分值分布（每项一行）</span>
                  <div className="field-control">
                    <textarea
                      id="paperQuestionDistribution"
                      value={values.questionDistribution}
                      onChange={(event) => updateField('questionDistribution', event.target.value)}
                      rows={5}
                      placeholder={DEFAULT_QUESTION_DISTRIBUTION}
                    />
                  </div>
                  {errors.questionDistribution ? <p className="form-error">{errors.questionDistribution}</p> : null}
                </label>

                <div className="form-field form-field--wide">
                  <span className="field-label">参考说明 / 附件（可选）</span>
                  <div className="upload-card paper-reference-card">
                    <ReferenceFilePicker
                      files={values.referenceFile}
                      disabled={isGenerating}
                      onFilesChange={(files) => updateField('referenceFile', files)}
                    />
                    <input
                      id="paperReferenceDescription"
                      value={values.referenceDescription}
                      onChange={(event) => updateField('referenceDescription', event.target.value)}
                      placeholder="补充命题偏好、重点章节或评分要求"
                    />
                  </div>
                </div>
                <TeacherKnowledgeSourceSelector
                  value={values.knowledgeDocumentIds}
                  disabled={isGenerating}
                  onChange={(ids) => updateField('knowledgeDocumentIds', ids)}
                />
              </div>

              <div className="action-row">
                <button className="primary-action" type="submit" disabled={isGenerating}>
                  {isGenerating ? '生成中...' : '开始生成'}
                </button>
                <span className="inline-status" aria-live="polite">
                  {statusMessage}
                </span>
              </div>
            </form>
          </section>

          <aside className="workbench-stack" ref={sideWrapRef}>
            <section className="workbench-panel workbench-panel--preview">
              <div className="panel-heading">
                <div className="panel-title-wrap">
                  <span className="panel-icon" aria-hidden="true">
                    <Icon name="chart" />
                  </span>
                  <div>
                    <h3>参数概览</h3>
                    <p>随左侧配置实时更新</p>
                  </div>
                </div>
                <button className="panel-action" type="button" onClick={() => void loadMyPapers()} disabled={isLoadingHistory}>
                  {isLoadingHistory ? '同步中...' : '管理我的试卷'}
                </button>
              </div>

              <div className="overview-grid">
                <div className="overview-item">
                  <span className="overview-label">题目总数</span>
                  <strong className="overview-value">
                    {questionCount}
                    <small> 题</small>
                  </strong>
                </div>
                <div className="overview-item">
                  <span className="overview-label">总分值</span>
                  <strong className="overview-value">
                    {totalScore}
                    <small> 分</small>
                  </strong>
                </div>
                <div className="overview-item">
                  <span className="overview-label">预计时长</span>
                  <strong className="overview-value">
                    {formatDuration(values.examDuration).replace('分钟', '')}
                    <small> 分钟</small>
                  </strong>
                </div>
                <div className="overview-item">
                  <span className="overview-label">难度系数</span>
                  <strong className="overview-value">
                    <small>{getDifficultyLabel(values.difficultyRatio)}</small>
                  </strong>
                </div>
              </div>
            </section>

            <section className="workbench-panel workbench-panel--preview">
              <div className="panel-heading">
                <div className="panel-title-wrap">
                  <span className="panel-icon" aria-hidden="true">
                    <Icon name="eye" />
                  </span>
                  <div>
                    <h3>试卷预览</h3>
                    <p>题型分布与示例题目</p>
                  </div>
                </div>
              </div>

              <div className="preview-columns">
                <div className="donut-card">
                  <div className="donut" data-value={questionCount} />
                  <ul className="legend-list">
                    {questionRows.map((row) => (
                      <li key={row.type}>
                        <span>{row.type}</span>
                        <strong>
                          {row.count}题 / {row.total}分
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>

                {paper ? (
                  <article className="preview-question">
                    <h4>{previewQuestion?.stem || '试卷已生成，完整内容见下方结果区'}</h4>
                    {previewQuestion?.options?.length ? (
                      <ol type="A">
                        {previewQuestion.options.map((option) => (
                          <li key={option}>{option}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="field-hint">生成结果会在下方展示试卷结构、题目与答案解析。</p>
                    )}
                  </article>
                ) : (
                  <div className="preview-empty">
                    <div>
                      <strong>生成的试卷将在此显示</strong>
                      <span>提交后会展示试卷结构、题目与答案解析。</span>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {paper ? (
              <section
                className="workbench-panel workbench-panel--result"
                data-testid="external-teacher-paper-result"
              >
                <div className="panel-heading">
                  <div className="panel-title-wrap">
                    <span className="panel-icon" aria-hidden="true">
                      <Icon name="shield" />
                    </span>
                    <div>
                      <h3>{paper.title}</h3>
                      <p>已生成并保存到历史记录</p>
                    </div>
                  </div>
                </div>

                {paper.quality_analysis?.coverage && paper.quality_analysis.depth && paper.quality_analysis.confidence ? (
                  <div className="quality-panel" data-testid="external-teacher-paper-quality">
                    <div>
                      <span>覆盖度</span>
                      <strong>{Math.round((paper.quality_analysis.coverage.coverage_rate || 0) * 100)}%</strong>
                    </div>
                    <div>
                      <span>深度</span>
                      <strong>{paper.quality_analysis.depth.actual_depth}</strong>
                    </div>
                    <div>
                      <span>置信度</span>
                      <strong>{Math.round((paper.quality_analysis.confidence.score || 0) * 100)}%</strong>
                    </div>
                    <p>{paper.quality_analysis.coverage.explanation || paper.quality_analysis.confidence.explanation}</p>
                  </div>
                ) : null}

                <div className="paper-markdown" data-testid="external-teacher-paper-markdown">
                  {renderMarkdownBlocks(paper.content)}
                </div>

                {paper.references.length ? (
                  <div className="reference-result-list">
                    <strong>知识引用</strong>
                    {paper.references.map((reference, index) => (
                      <article key={`${reference.source_type}-${reference.file_id || reference.document_id || index}`}>
                        <strong>{reference.source_filename || reference.source_type || `引用 ${index + 1}`}</strong>
                        {reference.excerpt ? <p>{reference.excerpt}</p> : null}
                      </article>
                    ))}
                  </div>
                ) : null}

                {paper.warnings.length ? (
                  <ul className="paper-warning-list">
                    {paper.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="paper-result-actions">
                  <button className="panel-action" type="button" onClick={handleSaveStatus}>
                    保存状态
                  </button>
                  <button className="panel-action" type="button" onClick={handleCopy}>
                    复制内容
                  </button>
                  <button className="panel-action" type="button" onClick={handleExport}>
                    导出 Markdown
                  </button>
                  {paper.artifact_id ? (
                    <a className="panel-action" href={`/teacher/artifacts/${paper.artifact_id}`}>
                      查看详情
                    </a>
                  ) : null}
                </div>
              </section>
            ) : null}

            {historyItems.length ? (
              <section className="workbench-panel workbench-panel--history" data-testid="external-teacher-paper-history">
                <div className="panel-heading">
                  <div className="panel-title-wrap">
                    <span className="panel-icon" aria-hidden="true">
                      <Icon name="paper" />
                    </span>
                    <div>
                      <h3>我的试卷</h3>
                      <p>来自生成历史的最新试卷</p>
                    </div>
                  </div>
                </div>
                <div className="history-list">
                  {historyItems.map((item) => (
                    <a key={item.id} href={`/teacher/artifacts/${item.id}`}>
                      <strong>{item.title}</strong>
                      <span>
                        {item.totalScore || '-'} 分 · {item.durationMinutes || '-'} 分钟 · {item.status}
                      </span>
                      <small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '暂无创建时间'}</small>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  )
}

function getQuestionCount(paper: ExamPaperGenerationResponse | null, rows: ReturnType<typeof parseQuestionRows>) {
  const sectionCount = paper?.data.sections.reduce((sum, section) => sum + (section.questions?.length || section.count || 0), 0)
  const rowCount = rows.reduce((sum, row) => sum + row.count, 0)
  return sectionCount || rowCount || 0
}

function getPreviewQuestion(paper: ExamPaperGenerationResponse | null): PaperQuestion | null {
  return paper?.data.sections.find((section) => section.questions?.length)?.questions?.[0] || null
}

function getDifficultyLabel(value: string) {
  if (!value) return '中等'
  if (value.includes('困难')) return '综合'
  if (value.includes('较难')) return '较难'
  if (value.includes('简单')) return '均衡'
  return value
}

function renderMarkdownBlocks(content: string) {
  if (!content.trim()) {
    return <p className="field-hint">本次生成暂无完整正文，请稍后重试或调整配置后重新生成。</p>
  }

  return <SafeMarkdown content={content} className="paper-markdown" />
}

function getPreparationStageLabel(phase: ExamPreparationProgress['phase']) {
  if (phase === 'uploading') return '正在上传参考文件'
  if (phase === 'parsing') return '正在解析参考文件'
  return '正在启动生成任务'
}

function getParseStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '等待解析',
    parsing: '解析中',
    parsed: '已解析',
    failed: '解析失败',
    deleted: '已删除'
  }
  return labels[status] || status
}

function Icon({ name }: { name: 'paper' | 'chart' | 'eye' | 'shield' }) {
  const paths: Record<typeof name, string> = {
    paper: 'M7 3h7l5 5v13H7z M14 3v6h6 M9 13h8 M9 17h6',
    chart: 'M5 19V9 M11 19V5 M17 19v-8 M3 21h18',
    eye: 'M2 12C4 8 7.5 6 12 6s8 2 10 6c-2 4-5.5 6-10 6S4 16 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z'
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
