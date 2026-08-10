import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { GenerationProgress, useSimulatedGenerationProgress } from '../../shared/GenerationProgress'
import { TaskStreamPanel } from '../../shared/TaskStreamPanel'
import SafeMarkdown from '../../shared/SafeMarkdown'
import { TeacherKnowledgeSourceSelector } from '../shared/TeacherKnowledgeSourceSelector'
import { TeacherClassSelector } from '../shared/TeacherClassSelector'

import PrismBackground from './PrismBackground'
import ReferenceFilePicker from './ReferenceFilePicker'
import TopNav from './TopNav'
import {
  DIFFICULTY_OPTIONS,
  fetchMyExercises,
  generateExercises,
  normalizeTextList,
  saveExerciseSet,
  validateExerciseGenerationForm,
  type ExerciseGenerationResponse,
  type ExerciseGenerationValues,
  type ExerciseHistoryItem,
  type ExerciseQuestion
} from './exerciseGenerationApi'

const QUESTION_TYPE_OPTIONS = ['单选题', '判断题', '填空题', '编程题']

const INITIAL_FORM_VALUES: ExerciseGenerationValues = {
  courseId: null,
  courseName: '',
  knowledgePoints: '',
  difficulty: '中等',
  questionCount: 20,
  questionTypes: '单选题, 判断题, 填空题, 编程题',
  referenceContent: '',
  referenceFile: [],
  knowledgeDocumentIds: []
}

export default function ExerciseGenerationPage() {
  const [formValues, setFormValues] = useState<ExerciseGenerationValues>(INITIAL_FORM_VALUES)
  const [errors, setErrors] = useState<Partial<Record<keyof ExerciseGenerationValues, string>>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('就绪')
  const [preview, setPreview] = useState<ExerciseGenerationResponse | null>(null)
  const [history, setHistory] = useState<ExerciseHistoryItem[]>([])
  const [historyVisible, setHistoryVisible] = useState(false)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [generationFailed, setGenerationFailed] = useState(false)

  const pageRef = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLElement | null>(null)
  const formWrapRef = useRef<HTMLElement | null>(null)
  const sideWrapRef = useRef<HTMLElement | null>(null)

  const activeQuestionTypes = useMemo(() => normalizeTextList(formValues.questionTypes), [formValues.questionTypes])
  const previewQuestions = preview?.data?.questions || []
  const simulatedProgress = useSimulatedGenerationProgress({
    active: isGenerating && !taskId,
    failed: generationFailed,
    resetKey: taskId || formValues.courseName
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

        if (context.conditions?.reduceMotion) {
          gsap.set(targets, { autoAlpha: 1 })
          return
        }

        gsap.fromTo(titleRef.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.72, delay: 0.12, ease: 'power3.out' })
        gsap.fromTo(
          [formWrapRef.current, sideWrapRef.current],
          { autoAlpha: 0, y: 18, scale: 0.992 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.82, delay: 0.24, stagger: 0.1, ease: 'power3.out' }
        )
      },
      pageRef
    )

    return () => mm.revert()
  }, [])

  const handleFieldChange = <K extends keyof ExerciseGenerationValues>(field: K, value: ExerciseGenerationValues[K]) => {
    setFormValues((current) => ({
      ...current,
      [field]: value
    }))

    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current }
        delete next[field]
        return next
      })
    }
  }

  const toggleQuestionType = (type: string) => {
    const currentTypes = normalizeTextList(formValues.questionTypes)
    const nextTypes = currentTypes.includes(type)
      ? currentTypes.filter((item) => item !== type)
      : [...currentTypes, type]

    handleFieldChange('questionTypes', nextTypes.join(', '))
  }

  const submitExerciseGeneration = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = validateExerciseGenerationForm(formValues)

    if (!validation.isValid) {
      setErrors(validation.errors)
      setStatusMessage(Object.values(validation.errors)[0] || '请检查表单内容')
      return
    }

    setIsGenerating(true)
    setGenerationFailed(false)
    setTaskId(null)
    setStatusMessage(formValues.referenceFile.length ? '正在上传参考文件并生成习题...' : '正在生成习题...')

    try {
      const response = await generateExercises(formValues)
      setTaskId(response.task_id)
      setStatusMessage('生成任务已提交，可在当前页面查看实时进度。')
    } catch (error) {
      setGenerationFailed(true)
      setStatusMessage('习题生成未完成，请检查输入后重试。')
    } finally {
      setIsGenerating(false)
    }
  }

  const loadExerciseHistory = async () => {
    setIsHistoryLoading(true)
    try {
      const response = await fetchMyExercises()
      setHistory(response.exercises)
      setHistoryVisible(true)
      setStatusMessage('已同步我的习题列表')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '读取我的习题失败')
    } finally {
      setIsHistoryLoading(false)
    }
  }

  const handleSave = async () => {
    if (!preview) {
      setStatusMessage('请先生成习题，再确认保存状态')
      return
    }
    try {
      const result = await saveExerciseSet(preview)
      setStatusMessage(result.message)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存状态确认失败')
    }
  }

  const handleCopy = async () => {
    if (!preview?.content) {
      setStatusMessage('暂无可复制的习题内容')
      return
    }
    try {
      await navigator.clipboard.writeText(preview.content)
      setStatusMessage('习题内容已复制到剪贴板')
    } catch {
      setStatusMessage('当前浏览器不允许直接复制，请手动选中结果内容复制')
    }
  }

  const handleExport = () => {
    if (!preview?.content) {
      setStatusMessage('暂无可导出的习题内容')
      return
    }

    const blob = new Blob([preview.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${preview.title || 'PrismMind-习题生成结果'}.md`
    anchor.click()
    URL.revokeObjectURL(url)
    setStatusMessage('习题内容已导出为 Markdown 文件')
  }

  return (
    <main
      className="teacher-workbench-page exercise-generation-page"
      data-testid="external-teacher-exercise-generation"
      data-external-source="Teacher/exercise_generation"
      ref={pageRef}
    >
      <TopNav />
      <PrismBackground />

      <div className="workbench-shell">
        <header className="workbench-hero" ref={titleRef}>
          <h1>习题生成</h1>
          <span className="workbench-subtitle">AI-DRIVEN EXERCISE GENERATION</span>
          <p>基于知识图谱与能力模型，智能生成高质量习题，精准匹配教学目标与难度要求。</p>
        </header>
        {!taskId ? (
          <GenerationProgress
            visible={simulatedProgress.visible}
            title={formValues.courseName || '习题批量生成'}
            subtitle="准备生成任务"
            statusText={generationFailed ? '习题生成未完成，请检查输入后重试。' : statusMessage}
            percent={simulatedProgress.percent}
            state={simulatedProgress.state}
            dataTestId="exercise-generation-progress"
          />
        ) : (
          <TaskStreamPanel
            taskId={taskId}
            title={formValues.courseName || '习题批量生成'}
            onCompleted={() => setStatusMessage('习题生成完成，结果已就绪。')}
            onFailed={() => setStatusMessage('习题生成未完成，请检查输入后重试。')}
          />
        )}

        <section className="workbench-layout">
          <section className="workbench-panel workbench-panel--form" ref={formWrapRef}>
            <div className="panel-heading">
              <div className="panel-title-wrap">
                <span className="panel-icon" aria-hidden="true">
                  <Icon name="document" />
                </span>
                <div>
                  <h2>生成配置</h2>
                  <p>课程、知识点、题型、难度与参考材料</p>
                </div>
              </div>
            </div>

            <form className="workbench-form" onSubmit={submitExerciseGeneration}>
              <div className="field-grid">
                <TeacherClassSelector
                  value={formValues.courseId}
                  disabled={isGenerating}
                  onChange={(courseId) => handleFieldChange('courseId', courseId)}
                />
                <label className="form-field form-field--wide" htmlFor="exerciseCourseName">
                  <span className="field-label">课程名称</span>
                  <div className="field-control">
                    <input
                      id="exerciseCourseName"
                      name="courseName"
                      value={formValues.courseName}
                      disabled={isGenerating}
                      onChange={(event) => handleFieldChange('courseName', event.target.value)}
                      placeholder="例如：Python程序设计"
                      aria-invalid={Boolean(errors.courseName)}
                    />
                  </div>
                  {errors.courseName ? <p className="form-error">{errors.courseName}</p> : null}
                </label>

                <label className="form-field form-field--wide" htmlFor="exerciseKnowledgePoints">
                  <span className="field-label">知识点 / 主题</span>
                  <div className="field-control">
                    <input
                      id="exerciseKnowledgePoints"
                      name="knowledgePoints"
                      value={formValues.knowledgePoints}
                      disabled={isGenerating}
                      onChange={(event) => handleFieldChange('knowledgePoints', event.target.value)}
                      placeholder="例如：Python函数基础"
                      aria-invalid={Boolean(errors.knowledgePoints)}
                    />
                  </div>
                  {errors.knowledgePoints ? <p className="form-error">{errors.knowledgePoints}</p> : null}
                </label>

                <div className="form-field form-field--wide">
                  <span className="field-label">题型（可多选）</span>
                  <div className="chip-row">
                    {QUESTION_TYPE_OPTIONS.map((type) => (
                      <button
                        className={`type-chip${activeQuestionTypes.includes(type) ? ' is-active' : ''}`}
                        key={type}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => toggleQuestionType(type)}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  <div className="field-control">
                    <input
                      id="exerciseQuestionTypes"
                      name="questionTypes"
                      value={formValues.questionTypes}
                      disabled={isGenerating}
                      onChange={(event) => handleFieldChange('questionTypes', event.target.value)}
                      placeholder="可补充其他题型，用逗号分隔"
                      aria-invalid={Boolean(errors.questionTypes)}
                    />
                  </div>
                  {errors.questionTypes ? <p className="form-error">{errors.questionTypes}</p> : null}
                </div>

                <div className="form-field form-field--wide">
                  <span className="field-label">难度要求</span>
                  <div className="segmented-control">
                    {DIFFICULTY_OPTIONS.map((difficulty) => (
                      <button
                        className={`segment-button${formValues.difficulty === difficulty ? ' is-active' : ''}`}
                        key={difficulty}
                        type="button"
                        disabled={isGenerating}
                        onClick={() => handleFieldChange('difficulty', difficulty)}
                      >
                        {difficulty}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="form-field" htmlFor="exerciseQuestionCount">
                  <span className="field-label">题量</span>
                  <div className="stepper-control">
                    <button
                      className="stepper-button"
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleFieldChange('questionCount', Math.max(1, Number(formValues.questionCount) - 1))}
                    >
                      -
                    </button>
                    <input
                      id="exerciseQuestionCount"
                      name="questionCount"
                      value={formValues.questionCount}
                      disabled={isGenerating}
                      onChange={(event) => handleFieldChange('questionCount', event.target.value)}
                      inputMode="numeric"
                      aria-invalid={Boolean(errors.questionCount)}
                    />
                    <button
                      className="stepper-button"
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleFieldChange('questionCount', Number(formValues.questionCount || 0) + 1)}
                    >
                      +
                    </button>
                  </div>
                  {errors.questionCount ? <p className="form-error">{errors.questionCount}</p> : null}
                </label>

                <label className="form-field form-field--wide" htmlFor="exerciseReferenceContent">
                  <span className="field-label">参考教材内容（可选）</span>
                  <div className="field-control">
                    <textarea
                      id="exerciseReferenceContent"
                      name="referenceContent"
                      value={formValues.referenceContent}
                      disabled={isGenerating}
                      onChange={(event) => handleFieldChange('referenceContent', event.target.value)}
                      rows={5}
                      maxLength={500}
                      placeholder="粘贴章节要点或教材片段，帮助系统贴合教学内容"
                    />
                  </div>
                  <span className="field-hint">{formValues.referenceContent.length} / 500</span>
                </label>

                <div className="form-field form-field--wide">
                  <span className="field-label">上传参考文件（可选）</span>
                  <ReferenceFilePicker
                    files={formValues.referenceFile}
                    disabled={isGenerating}
                    onFilesChange={(files) => handleFieldChange('referenceFile', files)}
                  />
                  <span className="field-hint">支持 PDF / DOCX / TXT / MD / PPT，生成时会一并处理参考材料。</span>
                </div>
                <TeacherKnowledgeSourceSelector
                  value={formValues.knowledgeDocumentIds}
                  disabled={isGenerating}
                  onChange={(ids) => handleFieldChange('knowledgeDocumentIds', ids)}
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
                    <Icon name="bulb" />
                  </span>
                  <div>
                    <h3>出题提示</h3>
                    <p>保持目标清晰，结果更稳定</p>
                  </div>
                </div>
                <button className="panel-action" type="button" disabled={isHistoryLoading} onClick={() => void loadExerciseHistory()}>
                  {isHistoryLoading ? '同步中...' : '管理我的习题'}
                </button>
              </div>
              <ul className="tips-list">
                {['覆盖核心知识点，贴合教学目标。', '难度与题型均衡，注意题干与应用结合。', '生成内容可预览并支持调整与再生成。'].map((tip, index) => (
                  <li className="tip-card" key={tip}>
                    <span className="tip-index">{String(index + 1).padStart(2, '0')}</span>
                    <p>{tip}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="workbench-panel workbench-panel--preview">
              <div className="panel-heading">
                <div className="panel-title-wrap">
                  <span className="panel-icon" aria-hidden="true">
                    <Icon name="eye" />
                  </span>
                  <div>
                    <h3>参数预览</h3>
                    <p>当前生成条件</p>
                  </div>
                </div>
              </div>
              <div className="parameter-grid">
                <ParameterItem label="课程名称" value={formValues.courseName || '未填写'} />
                <ParameterItem label="知识点 / 主题" value={formValues.knowledgePoints || '未填写'} />
                <ParameterItem label="题量" value={`${formValues.questionCount} 题`} />
                <ParameterItem label="题型" value={activeQuestionTypes.join('、') || '未填写'} />
                <ParameterItem label="难度要求" value={formValues.difficulty} />
                <ParameterItem label="参考内容" value={formValues.referenceContent ? '已填写' : '未填写'} />
                <ParameterItem label="参考文件" value={formValues.referenceFile.map((file) => file.name).join('、') || '未选择'} />
              </div>
            </section>

            <section className="workbench-panel workbench-panel--preview" data-testid="external-teacher-exercise-result-panel">
              <div className="panel-heading">
                <div className="panel-title-wrap">
                  <span className="panel-icon" aria-hidden="true">
                    <Icon name="book" />
                  </span>
                  <div>
                    <h3>习题预览</h3>
                    <p>题目结构、答案解析与质量分析</p>
                  </div>
                </div>
              </div>

              <ExercisePreview
                isGenerating={isGenerating}
                onCopy={handleCopy}
                onExport={handleExport}
                onSave={handleSave}
                preview={preview}
                questions={previewQuestions}
              />
            </section>

            {historyVisible ? (
              <section className="workbench-panel workbench-panel--preview" data-testid="external-teacher-exercise-history">
                <div className="panel-heading">
                  <div className="panel-title-wrap">
                    <span className="panel-icon" aria-hidden="true">
                      <Icon name="history" />
                    </span>
                    <div>
                      <h3>我的练习 / 历史记录</h3>
                      <p>来自习题生成历史</p>
                    </div>
                  </div>
                </div>
                <HistoryList history={history} loading={isHistoryLoading} />
              </section>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  )
}

function ParameterItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="parameter-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ExercisePreview({
  isGenerating,
  onCopy,
  onExport,
  onSave,
  preview,
  questions
}: {
  isGenerating: boolean
  onCopy: () => Promise<void>
  onExport: () => void
  onSave: () => Promise<void>
  preview: ExerciseGenerationResponse | null
  questions: ExerciseQuestion[]
}) {
  if (isGenerating) {
    return (
      <div className="preview-empty is-loading">
        <strong>正在生成习题...</strong>
        <span>AI 正在整理题型、难度和参考内容。</span>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="preview-empty">
        <strong>生成的习题将在此显示</strong>
        <span>提交后会展示题目总数、难度、题型分布和示例题。</span>
      </div>
    )
  }

  return (
    <div className="exercise-preview-result" data-testid="external-teacher-exercise-result">
      <div className="exercise-preview-console-title">
        <span>习题套组</span>
        <h2>{preview.data.title}</h2>
      </div>
      <div className="exercise-preview-meta">
        <span>
          <strong>{preview.data.questionCount}</strong>
          <em>题目总数</em>
        </span>
        <span>
          <strong>{preview.data.difficulty}</strong>
          <em>难度</em>
        </span>
        <span>
          <strong>{preview.data.questionTypes.join(' / ') || '待生成'}</strong>
          <em>题型分布</em>
        </span>
      </div>

      <QualityPanel preview={preview} />
      <QuestionList questions={questions} />
      <MarkdownBlock content={preview.content} />
      <ReferenceList preview={preview} />

      <div className="exercise-result-actions">
        <button className="panel-action" type="button" onClick={() => void onSave()}>
          保存状态
        </button>
        <button className="panel-action" type="button" onClick={() => void onCopy()}>
          复制
        </button>
        <button className="panel-action" type="button" onClick={onExport}>
          导出 Markdown
        </button>
        {preview.artifact_id ? (
          <a className="panel-action" href={`/teacher/artifacts/${preview.artifact_id}`}>
            查看详情
          </a>
        ) : null}
      </div>
    </div>
  )
}

function QuestionList({ questions }: { questions: ExerciseQuestion[] }) {
  if (!questions.length) return null

  return (
    <div className="exercise-question-preview-list" data-testid="external-teacher-exercise-questions">
      {questions.slice(0, 4).map((question, index) => (
        <article className="exercise-question-preview" key={question.id || `${question.stem}-${index}`}>
          <span className="question-preview-index">{index + 1}</span>
          <div>
            <strong>
              【{question.type}】{question.stem}
            </strong>
            {question.options.length > 0 ? (
              <div className="question-preview-options">
                {question.options.map((option, optionIndex) => (
                  <span key={`${question.id}-${option}-${optionIndex}`}>
                    {String.fromCharCode(65 + optionIndex)}. {option}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="question-preview-answer">
              <span>
                <em>答案</em>
                {question.answer || '见完整生成内容'}
              </span>
              <span>
                <em>解析</em>
                {question.analysis || '见完整生成内容'}
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function MarkdownBlock({ content }: { content: string }) {
  return <SafeMarkdown content={content} className="exercise-markdown" />
}

function QualityPanel({ preview }: { preview: ExerciseGenerationResponse }) {
  const analysis = preview.quality_analysis
  if (!analysis) {
    return (
      <div className="quality-panel" data-testid="external-teacher-exercise-quality">
        <strong>质量分析</strong>
        <span>本次生成暂无独立质量分析。</span>
      </div>
    )
  }

  const coverage = Number(analysis.coverage?.coverage_rate || 0)
  const coveragePercent = Math.round(coverage <= 1 ? coverage * 100 : coverage)

  return (
    <div className="quality-panel" data-testid="external-teacher-exercise-quality">
      <div>
        <span>覆盖度</span>
        <strong>{coveragePercent}%</strong>
      </div>
      <div>
        <span>深度</span>
        <strong>{analysis.depth?.score ?? '-'}</strong>
      </div>
      <div>
        <span>置信度</span>
        <strong>{analysis.confidence?.level || '-'}</strong>
      </div>
      {analysis.suggestions?.length ? <p>{analysis.suggestions.slice(0, 2).join('；')}</p> : null}
    </div>
  )
}

function ReferenceList({ preview }: { preview: ExerciseGenerationResponse }) {
  return (
    <div className="reference-result-list">
      {preview.references.length ? (
        <div data-testid="external-teacher-exercise-references">
          <strong>知识引用</strong>
          {preview.references.slice(0, 6).map((reference, index) => (
            <article key={`${reference.source_type}-${reference.file_id || reference.document_id || index}`}>
              <span>{reference.source_filename || `参考资料 ${reference.document_id || reference.file_id || index + 1}`}</span>
              <p>{reference.excerpt || reference.source_type}</p>
            </article>
          ))}
        </div>
      ) : null}
      {preview.warnings.length ? (
        <div data-testid="external-teacher-exercise-warnings">
          <strong>生成提示</strong>
          <ul>
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function HistoryList({ history, loading }: { history: ExerciseHistoryItem[]; loading: boolean }) {
  if (loading) {
    return <div className="preview-empty">正在读取生成历史...</div>
  }
  if (!history.length) {
    return (
      <div className="preview-empty">
        <strong>暂无生成历史</strong>
        <span>完成一次生成后会自动刷新。</span>
      </div>
    )
  }
  return (
    <div className="history-list">
      {history.map((item) => (
        <a href={`/teacher/artifacts/${item.id}`} key={`${item.id}-${item.createdAt}`}>
          <span>{item.status}</span>
          <strong>{item.title}</strong>
          <small>{formatDate(item.createdAt)}</small>
        </a>
      ))}
    </div>
  )
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function Icon({ name }: { name: 'document' | 'bulb' | 'eye' | 'book' | 'history' }) {
  const paths: Record<typeof name, string> = {
    document: 'M7 3h7l5 5v13H7z M14 3v6h6 M9 13h8 M9 17h6',
    bulb: 'M9 18h6 M10 22h4 M8 14a6 6 0 1 1 8 0c-1 1-1.5 2-1.5 3h-5C9.5 16 9 15 8 14z',
    eye: 'M2 12C4.5 7.5 8 6 12 6s7.5 1.5 10 6c-2.5 4.5-6 6-10 6S4.5 16.5 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
    book: 'M4 5a3 3 0 0 1 3-2h13v16H7a3 3 0 0 0-3 2z M4 5v16 M8 7h8',
    history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l4 2'
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
