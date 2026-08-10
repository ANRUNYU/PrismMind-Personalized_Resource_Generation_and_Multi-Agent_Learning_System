import { useEffect, useRef, useState, type FormEvent } from 'react'
import gsap from 'gsap'
import { GenerationProgress, useSimulatedGenerationProgress } from '../../shared/GenerationProgress'
import { TaskStreamPanel } from '../../shared/TaskStreamPanel'
import { TeacherKnowledgeSourceSelector } from '../shared/TeacherKnowledgeSourceSelector'
import { TeacherClassSelector } from '../shared/TeacherClassSelector'

import PlanDisplayPanel from './PlanDisplayPanel'
import PrismBackground from './PrismBackground'
import SkillsDisplayPanel from './SkillsDisplayPanel'
import StepIndicator, { type TrainingPhase } from './StepIndicator'
import TopNav from './TopNav'
import UploadDropzone from './UploadDropzone'
import {
  extractCoreSkills,
  fetchMyTrainingPlans,
  generateTrainingPlan,
  saveTrainingPlan,
  validateTrainingProgramForm,
  type ExtractedTrainingSkills,
  type TrainingPlanGenerationResponse,
  type TrainingPlanHistoryItem,
  type TrainingProgramFormValues
} from './trainingProgramApi'

const INITIAL_FORM_VALUES: TrainingProgramFormValues = {
  courseId: null,
  programName: '',
  educationLevel: '',
  majorName: '',
  focusPrompt: '',
  uploadedFile: [],
  knowledgeDocumentIds: []
}

export default function TrainingProgramPage() {
  const [formValues, setFormValues] = useState<TrainingProgramFormValues>(INITIAL_FORM_VALUES)
  const [errors, setErrors] = useState<Partial<Record<keyof TrainingProgramFormValues, string>>>({})
  const [phase, setPhase] = useState<TrainingPhase>('idle')
  const [statusMessage, setStatusMessage] = useState('就绪')
  const [extraction, setExtraction] = useState<ExtractedTrainingSkills | null>(null)
  const [plan, setPlan] = useState<TrainingPlanGenerationResponse | null>(null)
  const [history, setHistory] = useState<TrainingPlanHistoryItem[]>([])
  const [historyVisible, setHistoryVisible] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [taskId, setTaskId] = useState<number | null>(null)

  const pageRef = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLElement | null>(null)
  const actionPanelRef = useRef<HTMLElement | null>(null)
  const skillsPanelRef = useRef<HTMLElement | null>(null)
  const planPanelRef = useRef<HTMLElement | null>(null)

  const isBusy = phase === 'extracting' || phase === 'generating'
  const simulatedProgress = useSimulatedGenerationProgress({
    active: isBusy && !taskId,
    failed: phase === 'error',
    resetKey: phase
  })

  useEffect(() => {
    const mm = gsap.matchMedia()

    mm.add(
      {
        reduceMotion: '(prefers-reduced-motion: reduce)',
        allowMotion: '(prefers-reduced-motion: no-preference)'
      },
      (context) => {
        const nodes = [titleRef.current, actionPanelRef.current, skillsPanelRef.current, planPanelRef.current].filter(Boolean)

        if (context.conditions?.reduceMotion) {
          gsap.set(nodes, { autoAlpha: 1 })
          return
        }

        gsap.fromTo(titleRef.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.72, delay: 0.12, ease: 'power3.out' })
        gsap.fromTo(
          [actionPanelRef.current, skillsPanelRef.current, planPanelRef.current],
          { autoAlpha: 0, y: 18, scale: 0.992 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.82, delay: 0.24, stagger: 0.1, ease: 'power3.out' }
        )
      },
      pageRef
    )

    return () => mm.revert()
  }, [])

  const handleFieldChange = <K extends keyof TrainingProgramFormValues>(field: K, value: TrainingProgramFormValues[K]) => {
    setFormValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current }
        delete next[field]
        return next
      })
    }
  }

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = validateTrainingProgramForm(formValues)
    if (!validation.isValid) {
      setErrors(validation.errors)
      setStatusMessage(Object.values(validation.errors)[0] || '请检查表单内容。')
      return
    }

    setExtraction(null)
    setPlan(null)
    setTaskId(null)
    setPhase('extracting')
    setStatusMessage('正在提取核心技能...')

    try {
      const extracted = await extractCoreSkills(formValues, setStatusMessage)
      setExtraction(extracted)
      setPhase('generating')
      setStatusMessage('正在基于核心技能生成培养方案...')

      const generated = await generateTrainingPlan(formValues, extracted)
      setTaskId(generated.task_id)
      setPhase('generating')
      setStatusMessage('生成任务已提交，正在整理培养方案。')
      if (historyVisible) {
        await loadPlanHistory()
      }
    } catch (error) {
      setPhase('error')
      setStatusMessage('培养方案生成未完成，请检查输入后重试。')
    }
  }

  const loadPlanHistory = async () => {
    setIsHistoryLoading(true)
    try {
      const response = await fetchMyTrainingPlans()
      setHistory(response.plans)
      setHistoryVisible(true)
      setStatusMessage('已同步我的培养方案历史。')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '读取培养方案历史失败。')
    } finally {
      setIsHistoryLoading(false)
    }
  }

  const handleSavePlan = async () => {
    if (!plan) {
      setStatusMessage('请先生成培养方案后再确认保存状态。')
      return
    }
    try {
      const response = await saveTrainingPlan(plan)
      setStatusMessage(response.message)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '保存状态确认失败。')
    }
  }

  const handleCopy = async () => {
    if (!plan?.content) {
      setStatusMessage('暂无可复制的培养方案内容。')
      return
    }
    try {
      await navigator.clipboard.writeText(plan.content)
      setStatusMessage('培养方案内容已复制到剪贴板。')
    } catch {
      setStatusMessage('当前浏览器不允许直接复制，请手动选中结果内容复制。')
    }
  }

  const handleExport = () => {
    if (!plan?.content) {
      setStatusMessage('暂无可导出的培养方案内容。')
      return
    }
    const blob = new Blob([plan.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${plan.title || 'PrismMind-培养方案生成结果'}.md`
    anchor.click()
    URL.revokeObjectURL(url)
    setStatusMessage('培养方案内容已导出为 Markdown 文件。')
  }

  return (
    <main
      className="teacher-workbench-page training-program-page"
      data-testid="external-teacher-training-program"
      data-external-source="Teacher/training_program"
      ref={pageRef}
    >
      <TopNav />
      <PrismBackground />

      <div className="workbench-shell">
        <header className="workbench-hero" ref={titleRef}>
          <h1>智能培养方案生成</h1>
          <span className="workbench-subtitle">AI-DRIVEN TRAINING PROGRAM GENERATION</span>
          <p>根据培养方案基本信息提取核心技能并生成系统化方案；也可选用课程材料、知识库与教师关注点补充依据。</p>
        </header>
        {!taskId ? (
          <GenerationProgress
            visible={simulatedProgress.visible}
            title={formValues.programName || '智能培养方案'}
            subtitle={phase === 'extracting' ? '提取核心技能' : '生成方案'}
            statusText={phase === 'error' ? '培养方案生成未完成，请检查输入后重试。' : statusMessage}
            percent={simulatedProgress.percent}
            state={simulatedProgress.state}
            dataTestId="training-program-generation-progress"
          />
        ) : (
          <TaskStreamPanel
            taskId={taskId}
            title={formValues.programName || '智能培养方案'}
            onCompleted={() => {
              setPhase('generated')
              setStatusMessage('培养方案生成完成，结果已就绪。')
            }}
            onFailed={() => {
              setPhase('error')
              setStatusMessage('培养方案生成未完成，请检查输入后重试。')
            }}
          />
        )}

        <section className="workbench-layout">
          <section className="workbench-panel workbench-panel--form" ref={actionPanelRef}>
            <div className="panel-heading">
              <div className="panel-title-wrap">
                <span className="panel-icon" aria-hidden="true">
                  <Icon name="clipboard" />
                </span>
                <div>
                  <h2>方案生成工作台</h2>
                  <p>培养层次、专业方向、关注点、课程材料与两阶段生成流程</p>
                </div>
              </div>
              <button className="panel-action" type="button" disabled={isHistoryLoading} onClick={() => void loadPlanHistory()}>
                {isHistoryLoading ? '同步中...' : '管理方案'}
              </button>
            </div>

            <form className="workbench-form" onSubmit={handleGenerate}>
              <div className="field-grid">
                <TeacherClassSelector
                  value={formValues.courseId}
                  disabled={isBusy}
                  onChange={(courseId) => handleFieldChange('courseId', courseId)}
                />
                <label className={`form-field form-field--wide${errors.programName ? ' has-error' : ''}`} htmlFor="trainingProgramName">
                  <span className="field-label">方案名称</span>
                  <div className="field-control">
                    <input
                      id="trainingProgramName"
                      name="programName"
                      disabled={isBusy}
                      maxLength={120}
                      value={formValues.programName}
                      onChange={(event) => handleFieldChange('programName', event.target.value)}
                      placeholder="例如：人工智能专业人才培养方案"
                      aria-invalid={Boolean(errors.programName)}
                    />
                  </div>
                  {errors.programName ? <p className="form-error">{errors.programName}</p> : null}
                </label>

                <label className={errors.educationLevel ? 'form-field has-error' : 'form-field'} htmlFor="trainingEducationLevel">
                  <span className="field-label">培养层次</span>
                  <div className="field-control">
                    <input
                      id="trainingEducationLevel"
                      name="educationLevel"
                      disabled={isBusy}
                      maxLength={80}
                      value={formValues.educationLevel}
                      onChange={(event) => handleFieldChange('educationLevel', event.target.value)}
                      placeholder="本科 / 高职 / 研究生"
                      aria-invalid={Boolean(errors.educationLevel)}
                    />
                  </div>
                  {errors.educationLevel ? <p className="form-error">{errors.educationLevel}</p> : null}
                </label>

                <label className={errors.majorName ? 'form-field has-error' : 'form-field'} htmlFor="trainingMajorName">
                  <span className="field-label">专业名称</span>
                  <div className="field-control">
                    <input
                      id="trainingMajorName"
                      name="majorName"
                      disabled={isBusy}
                      maxLength={120}
                      value={formValues.majorName}
                      onChange={(event) => handleFieldChange('majorName', event.target.value)}
                      placeholder="例如：智能科学与技术"
                      aria-invalid={Boolean(errors.majorName)}
                    />
                  </div>
                  {errors.majorName ? <p className="form-error">{errors.majorName}</p> : null}
                </label>

                <label className={`form-field form-field--wide${errors.focusPrompt ? ' has-error' : ''}`} htmlFor="trainingFocusPrompt">
                  <span className="field-label">关注点提示（可选）</span>
                  <div className="field-control">
                    <textarea
                      id="trainingFocusPrompt"
                      name="focusPrompt"
                      disabled={isBusy}
                      maxLength={800}
                      rows={5}
                      placeholder="例如：就业导向、项目实践、AI 教育应用、知识库检索增强、学生画像与学习评估闭环。"
                      value={formValues.focusPrompt}
                      onChange={(event) => handleFieldChange('focusPrompt', event.target.value)}
                      aria-invalid={Boolean(errors.focusPrompt)}
                    />
                  </div>
                  <span className="field-hint">{formValues.focusPrompt.length} / 800</span>
                  {errors.focusPrompt ? <p className="form-error">{errors.focusPrompt}</p> : null}
                </label>

                <div className="form-field form-field--wide">
                  <UploadDropzone
                    files={formValues.uploadedFile}
                    disabled={isBusy}
                    onFilesChange={(files) => handleFieldChange('uploadedFile', files)}
                    onClear={() => handleFieldChange('uploadedFile', [])}
                  />
                </div>
                <TeacherKnowledgeSourceSelector
                  value={formValues.knowledgeDocumentIds}
                  disabled={isBusy}
                  onChange={(ids) => handleFieldChange('knowledgeDocumentIds', ids)}
                />
              </div>

              <StepIndicator phase={phase} />

              <div className="action-row">
                <button className="primary-action" type="submit" disabled={isBusy}>
                  {buttonLabel(phase)}
                </button>
                <span className="inline-status" aria-live="polite">
                  {statusMessage}
                </span>
              </div>
            </form>
          </section>

          <aside className="workbench-stack">
            <section ref={skillsPanelRef}>
              <SkillsDisplayPanel skills={extraction?.skills || []} phase={phase} />
            </section>
            <section ref={planPanelRef}>
              <PlanDisplayPanel
                plan={plan}
                phase={phase}
                onCopy={handleCopy}
                onExport={handleExport}
                onSave={handleSavePlan}
              />
            </section>
            {historyVisible ? <HistoryPanel history={history} loading={isHistoryLoading} /> : null}
          </aside>
        </section>
      </div>
    </main>
  )
}

function HistoryPanel({ history, loading }: { history: TrainingPlanHistoryItem[]; loading: boolean }) {
  return (
    <section className="training-result-panel hud-panel" data-testid="external-teacher-training-history">
      <header className="training-result-header">
        <div>
          <span className="training-result-title">我的培养方案</span>
          <span className="training-result-subtitle">来自生成历史中的培养方案记录</span>
        </div>
      </header>
      {loading ? <div className="training-empty-state">正在读取生成历史...</div> : null}
      {!loading && !history.length ? (
        <div className="training-empty-state">
          <strong>暂无生成历史</strong>
          <small>完成一次生成后会自动进入历史记录。</small>
        </div>
      ) : null}
      {!loading && history.length ? (
        <div className="history-list">
          {history.map((item) => (
            <a href={`/teacher/artifacts/${item.id}`} key={`${item.id}-${item.createdAt}`}>
              <span>{formatHistoryStatus(item.status)}</span>
              <strong>{item.title}</strong>
              <small>{formatDate(item.createdAt)}</small>
            </a>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function buttonLabel(phase: TrainingPhase) {
  if (phase === 'extracting') return '正在提取技能...'
  if (phase === 'generating') return '正在生成方案...'
  return '开始生成'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatHistoryStatus(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return '已生成'
  if (normalized === 'completed' || normalized === 'success' || normalized === 'ready') return '已完成'
  if (normalized === 'pending' || normalized === 'queued') return '排队中'
  if (normalized === 'running' || normalized === 'processing') return '生成中'
  if (normalized === 'failed' || normalized === 'error') return '生成失败'
  return value || '已生成'
}

function Icon({ name }: { name: 'clipboard' }) {
  const paths = {
    clipboard: 'M9 3h6l1 2h3v16H5V5h3z M9 9h6 M9 13h6 M9 17h4'
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
