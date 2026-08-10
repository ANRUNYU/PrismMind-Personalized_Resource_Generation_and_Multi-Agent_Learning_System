import { useEffect, useMemo, useState, type FormEvent } from 'react'

import {
  completeLearningPathStep,
  createLearningPath,
  generateStepQuiz,
  getLearningPath,
  getLearningPaths,
  type LearningPath,
  type LearningPathStep,
  type PathDifficulty
} from '@/api/learningPaths'
import { getKnowledgeDocuments, type KnowledgeDocument } from '@/api/knowledge'
import { startStudentTest, submitStudentTest, type TestDetail, type TestSubmitResponse } from '@/api/tests'
import { GenerationProgress, useSimulatedGenerationProgress } from '@/external/shared/GenerationProgress'
import KnowledgeDocumentMultiSelect from '@/external/shared/KnowledgeDocumentMultiSelect'

import PageShell from '../shared/PageShell/PageShell'
import { GlassPanel, PrimaryButton, SecondaryButton } from '../shared/ui/CommonUI'
import './StudyPlanPage.css'

const toneNames = ['teal', 'green', 'violet', 'blue'] as const

interface PlanCardModel {
  id: number
  title: string
  tag: string
  status: string
  progress: number
  description: string
  icon: string
  tone: (typeof toneNames)[number]
}

interface StudyStepModel {
  dbId?: number | null
  id: string
  stepIndex: number
  order: number
  title: string
  knowledgePoint: string
  content: string
  duration: number
  goal: string
  status: string
  rawStatus: string
  externalLabel: string
  externalUrl?: string
}

interface QuizExercise {
  id: string
  title: string
  options: Array<{ key: string; text: string }>
  questionType: string
}

const DEFAULT_DURATION_DAYS = 14
const DEFAULT_DAILY_MINUTES = 45
const DEFAULT_DIFFICULTY: PathDifficulty = 'normal'

function clampPercent(value?: number | null) {
  return Math.max(0, Math.min(100, Math.round(value || 0)))
}

function formatDate(value?: string | null) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function normalizeStatus(status?: string | null) {
  const statusMap: Record<string, string> = {
    active: '进行中',
    completed: '已完成',
    archived: '已归档',
    pending: '待开始',
    in_progress: '进行中'
  }
  return statusMap[status || ''] || '进行中'
}

function normalizeStepStatus(status?: string | null) {
  const statusMap: Record<string, string> = {
    pending: '待解锁',
    locked: '待解锁',
    active: '开始学习',
    learning: '学习中',
    in_progress: '学习中',
    quiz_required: '待完成测验',
    completed: '已完成'
  }
  return statusMap[status || ''] || '待解锁'
}

function toPlanCard(path: LearningPath, index: number): PlanCardModel {
  const progress = clampPercent(path.completion_rate)
  const totalSteps = path.path_steps?.length || 0
  const topic = path.topic || path.title
  return {
    id: path.id,
    title: path.title,
    tag: `${topic} · ${totalSteps} 个步骤`,
    status: normalizeStatus(path.status),
    progress,
    description: `当前进度 ${progress}%，最近更新 ${formatDate(path.updated_at)}`,
    icon: String(index + 1).padStart(2, '0'),
    tone: toneNames[index % toneNames.length]
  }
}

function toStudyStep(step: LearningPathStep): StudyStepModel {
  const order = step.step_index + 1
  return {
    dbId: step.id,
    id: `${step.step_index}-${step.title}`,
    stepIndex: step.step_index,
    order,
    title: step.title || `学习步骤 ${order}`,
    knowledgePoint: step.knowledge_point || step.knowledge_points?.[0] || step.title || '',
    content: step.learning_activity || step.objective || '本步骤将围绕当前知识点完成学习活动。',
    duration: step.estimated_minutes || 0,
    goal: step.completion_criteria || step.objective || '完成本步骤学习目标并进行复盘。',
    status: normalizeStepStatus(step.status),
    rawStatus: step.status || 'locked',
    externalLabel: step.suggested_resource_ids?.length ? `关联资源 ${step.suggested_resource_ids.length} 个` : '课程资源待关联'
  }
}

function findCurrentStep(path: LearningPath | null) {
  if (!path?.path_steps?.length) return null
  return (
    path.path_steps.find((step) => step.step_index === path.current_step) ||
    path.path_steps.find((step) => step.status !== 'completed') ||
    path.path_steps[0]
  )
}

function mapQuizExercises(test: TestDetail): QuizExercise[] {
  return test.questions.map((item) => ({
    id: item.id,
    title: item.stem,
    options: item.options || [],
    questionType: item.question_type
  }))
}

function getErrorMessage(error: unknown, defaultMessage: string) {
  return error instanceof Error && error.message ? error.message : defaultMessage
}

function ProgressRing({ value, completed = 0, total = 0 }: { value: number; completed?: number; total?: number }) {
  return (
    <div className="study-progress-ring" style={{ '--progress': `${value * 3.6}deg` } as React.CSSProperties}>
      <strong>{value}%</strong>
      <span>总体进度</span>
      <small>
        {completed} / {total} 步骤
      </small>
    </div>
  )
}

function PlanCard({ plan, active, onClick }: { plan: PlanCardModel; active: boolean; onClick: () => void }) {
  return (
    <button className={`study-plan-card ${active ? 'is-active' : ''}`} type="button" onClick={onClick}>
      <span className={`study-card-icon tone-${plan.tone}`}>{plan.icon}</span>
      <span className="study-card-copy">
        <span className="study-card-title-row">
          <strong>{plan.title}</strong>
          <em className={plan.status === '进行中' ? 'is-running' : ''}>{plan.status}</em>
        </span>
        <span className="study-card-tag">{plan.tag}</span>
        <i aria-hidden="true">
          <b style={{ width: `${plan.progress}%` }} />
        </i>
        <small>{plan.description}</small>
      </span>
      <span className="study-card-progress">{plan.progress}%</span>
      <span className="study-card-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  )
}

function StepBlock({ step, pathId, onOpen }: { step: StudyStepModel; pathId: number; onOpen: () => void }) {
  const searchKeyword = step.knowledgePoint || step.title
  const externalUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(`${searchKeyword} 讲解`)}`
  const externalLabel = '在 Bilibili 搜索该知识点'
  return (
    <article className={`study-step-block is-${step.status === '已完成' ? 'completed' : 'active'}`}>
      <span className="study-step-index">{step.order}</span>
      <div className="study-step-copy">
        <h3>
          {step.dbId ? (
            <button
              type="button"
              className="study-step-title-button"
              onClick={onOpen}
              aria-label={`${step.title}，${step.rawStatus === 'locked' ? '尚未解锁' : '打开章节学习'}`}
            >
              {step.title}
            </button>
          ) : step.title}
        </h3>
        <p>
          <strong>内容：</strong>
          {step.content}
        </p>
        <div className="study-step-meta">
          <span>
            <strong>耗时：</strong>
            {step.duration || 0} 分钟
          </span>
          <span>
            <strong>学习目标：</strong>
            {step.goal}
          </span>
          <span>
            <strong>状态：</strong>
            {step.status}
          </span>
        </div>
        {externalUrl ? (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Bilibili 搜索 ${searchKeyword} 讲解视频`}>
            {externalLabel}
            <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <span className="study-step-link-muted">{step.externalLabel}</span>
        )}
      </div>
      <a className="study-play-button" href={externalUrl} target="_blank" rel="noopener noreferrer" aria-label={`在 Bilibili 搜索 ${searchKeyword} 讲解视频`}>
        ▶
      </a>
    </article>
  )
}

function ExercisePanel({
  open,
  exercises,
  currentStep,
  answers,
  isSubmitting,
  result,
  onClose,
  onAnswer,
  onSubmit
}: {
  open: boolean
  exercises: QuizExercise[]
  currentStep: StudyStepModel | null
  answers: Record<string, string>
  isSubmitting: boolean
  result: TestSubmitResponse | null
  onClose: () => void
  onAnswer: (questionId: string, answer: string) => void
  onSubmit: () => void
}) {
  if (!open) {
    return (
      <GlassPanel className="study-side-helper">
        <header className="study-helper-head">
          <h2>路径辅助</h2>
          <span>待练习</span>
        </header>
        <div className="study-helper-current">
          <small>当前步骤</small>
          <strong>{currentStep?.title || '请选择学习路径'}</strong>
          <p>点击章节标题进入学习内容，完成学习后会在当前页面生成对应知识点的小测。</p>
        </div>
        <ul className="study-helper-notes">
          <li>步骤列表支持独立滚动查看完整内容。</li>
          <li>阶段小测会结合当前学习步骤生成，帮助你复盘关键点。</li>
        </ul>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="study-exercise-panel">
      <header className="study-floating-header">
        <h2>步骤配套练习</h2>
        <button type="button" aria-label="关闭" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="study-exercise-head">
        <span>当前步骤</span>
        <strong>{currentStep?.title}</strong>
        <em>共 {exercises.length} 题</em>
      </div>
      <div className="study-exercise-list">
        {result ? (
          <div className="study-quiz-result" role="status">
            <strong>本次测验得分：{result.score}</strong>
            <p>{result.feedback || result.analysis || '测验结果已保存。'}</p>
            {result.question_results?.length ? (
              <ul className="study-question-feedback">
                {result.question_results.map((item, index) => (
                  <li key={item.question_id} className={item.is_correct ? 'is-correct' : 'is-incorrect'}>
                    <strong>第 {index + 1} 题：{item.is_correct ? '回答正确' : '需要巩固'}</strong>
                    {item.analysis ? <p>{item.analysis}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {exercises.map((question, questionIndex) => (
          <details key={question.id} open={questionIndex === 0}>
            <summary>
              <span>
                {questionIndex + 1}. {question.title}
              </span>
              <i aria-hidden="true">⌄</i>
            </summary>
            <div className="study-options">
              {question.options.length ? (
                question.options.map((option) => (
                  <label key={option.key}>
                    <input
                      type="radio"
                      name={question.id}
                      checked={answers[question.id] === option.key}
                      onChange={() => onAnswer(question.id, option.key)}
                    />
                    <span>{option.key}. {option.text}</span>
                  </label>
                ))
              ) : (
                <label className="study-answer-field">
                  <span>你的思考</span>
                  <textarea
                    value={answers[question.id] || ''}
                    onChange={(event) => onAnswer(question.id, event.target.value)}
                    placeholder="写下你的作答或复盘要点"
                  />
                </label>
              )}
            </div>
          </details>
        ))}
      </div>
      <footer className="study-exercise-actions">
        <SecondaryButton onClick={onClose}>稍后练习</SecondaryButton>
        <PrimaryButton isLoading={isSubmitting} onClick={onSubmit} disabled={Boolean(result)}>
          {result ? '测验已提交' : '提交测验'}
        </PrimaryButton>
      </footer>
    </GlassPanel>
  )
}

export default function ExternalStudentLearningPaths() {
  const [topic, setTopic] = useState('')
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [activePlan, setActivePlan] = useState<LearningPath | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [exerciseOpen, setExerciseOpen] = useState(false)
  const [exercises, setExercises] = useState<QuizExercise[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stepBusy, setStepBusy] = useState(false)
  const [activeTestId, setActiveTestId] = useState<number | null>(null)
  const [activeQuizStepId, setActiveQuizStepId] = useState<number | null>(null)
  const [activeQuizPassScore, setActiveQuizPassScore] = useState(60)
  const [quizResult, setQuizResult] = useState<TestSubmitResponse | null>(null)
  const [selectedStep, setSelectedStep] = useState<StudyStepModel | null>(null)
  const [generationFailed, setGenerationFailed] = useState(false)
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([])
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeError, setKnowledgeError] = useState('')

  const planCards = useMemo(() => paths.map((path, index) => toPlanCard(path, index)), [paths])
  const activeSteps = useMemo(() => activePlan?.path_steps?.map(toStudyStep) || [], [activePlan])
  const currentStepRaw = useMemo(() => findCurrentStep(activePlan), [activePlan])
  const currentStep = useMemo(() => (currentStepRaw ? toStudyStep(currentStepRaw) : null), [currentStepRaw])
  const completedSteps = useMemo(
    () => activePlan?.path_steps?.filter((step) => step.status === 'completed').length || 0,
    [activePlan]
  )
  const totalMinutes = useMemo(
    () => activePlan?.path_steps?.reduce((sum, step) => sum + (step.estimated_minutes || 0), 0) || 0,
    [activePlan]
  )
  const simulatedProgress = useSimulatedGenerationProgress({
    active: isGenerating,
    failed: generationFailed,
    resetKey: topic
  })

  async function loadPaths(preferredPathId?: number) {
    setIsLoading(true)
    setErrorMessage('')
    try {
      const data = await getLearningPaths({ page: 1, page_size: 30 })
      const nextPaths = data.items || []
      setPaths(nextPaths)

      const targetPath = preferredPathId
        ? nextPaths.find((item) => item.id === preferredPathId)
        : nextPaths.find((item) => item.id === activePlan?.id) || nextPaths[0]

      if (targetPath) {
        const detail = await getLearningPath(targetPath.id)
        setActivePlan(detail)
      } else {
        setActivePlan(null)
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '学习路径加载失败，请稍后重试。'))
    } finally {
      setIsLoading(false)
    }
  }

  async function loadKnowledgeDocuments(selectLatest = false) {
    setKnowledgeLoading(true)
    setKnowledgeError('')
    try {
      const data = await getKnowledgeDocuments({ page: 1, page_size: 100, status: 'ingested' })
      const readyDocuments = (data.items || []).filter((document) => document.status === 'ingested')
      setKnowledgeDocuments(readyDocuments)
      setSelectedDocumentIds((current) => {
        const readyIds = new Set(readyDocuments.map((document) => document.id))
        const validSelection = current.filter((id) => readyIds.has(id))
        const latestId = readyDocuments[0]?.id
        if (selectLatest && latestId && !validSelection.includes(latestId)) return [latestId, ...validSelection]
        return validSelection
      })
    } catch (error) {
      setKnowledgeError(getErrorMessage(error, '知识库资料加载失败，请稍后重试。'))
    } finally {
      setKnowledgeLoading(false)
    }
  }

  async function handleCreatePlan(event: FormEvent) {
    event.preventDefault()
    const cleanTopic = topic.trim()
    const cleanGoal = `围绕 ${cleanTopic} 建立阶段化学习路径。`

    if (!cleanTopic) {
      setErrorMessage('请输入学习主题后再生成路径。')
      return
    }

    setIsGenerating(true)
    setGenerationFailed(false)
    setErrorMessage('')
    setStatusMessage('正在生成个性化学习路径...')

    try {
      const plan = await createLearningPath({
        title: cleanTopic,
        topic: cleanTopic,
        target_goal: cleanGoal,
        knowledge_points: [],
        duration_days: DEFAULT_DURATION_DAYS,
        daily_minutes: DEFAULT_DAILY_MINUTES,
        difficulty: DEFAULT_DIFFICULTY,
        course_id: null,
        resource_ids: null,
        use_profile: true,
        use_existing_resources: true,
        use_knowledge_base: selectedDocumentIds.length > 0,
        knowledge_document_ids: selectedDocumentIds,
        top_k: 8,
        additional_requirements: null
      })
      setTopic('')
      setExerciseOpen(false)
      setStatusMessage('学习路径已生成，已同步到路径列表。')
      await loadPaths(plan.id)
    } catch (error) {
      setGenerationFailed(true)
      setErrorMessage(getErrorMessage(error, '学习路径生成未完成，请检查输入后重试。'))
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleOpenPlan(planId: number) {
    setErrorMessage('')
    setExerciseOpen(false)
    setStatusMessage('正在打开路径详情...')
    try {
      const detail = await getLearningPath(planId)
      setActivePlan(detail)
      setStatusMessage('路径详情已打开。')
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '路径详情加载失败。'))
    }
  }

  async function handleNextStep() {
    if (!activePlan || !currentStepRaw) return
    if (!selectedStep?.dbId || selectedStep.dbId !== currentStepRaw.id) {
      setErrorMessage('只能学习并测验当前已解锁章节。')
      return
    }

    setStepBusy(true)
    setErrorMessage('')
    setStatusMessage('正在推进学习步骤并生成阶段小测...')
    try {
      if (!currentStepRaw.id) throw new Error('当前步骤缺少标准化步骤 ID')
      await completeLearningPathStep(activePlan.id, currentStepRaw.id, {
        reflection: '已完成当前步骤并进行学习复盘。',
        time_spent_minutes: currentStepRaw.estimated_minutes || DEFAULT_DAILY_MINUTES
      })
      const quizResult = await generateStepQuiz(activePlan.id, {
          step_index: currentStepRaw.step_index,
          question_count: 3,
          difficulty: DEFAULT_DIFFICULTY
        })
      if (!quizResult.test_id) throw new Error('步骤测验创建失败')
      const test = await startStudentTest(quizResult.test_id)
      setActiveTestId(quizResult.test_id)
      setActiveQuizStepId(currentStepRaw.id || null)
      setActiveQuizPassScore(Number(currentStepRaw.pass_score || 60))
      setExercises(mapQuizExercises(test))
      setAnswers({})
      setQuizResult(null)
      setExerciseOpen(true)
      setStatusMessage('章节学习已完成，测验已在当前弹窗中生成。')
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '推进学习或生成小测失败。'))
    } finally {
      setStepBusy(false)
    }
  }

  async function handleSubmitExercises() {
    if (!exercises.length) return
    const allAnswered = exercises.every((item) => (answers[item.id] || '').trim())
    if (!allAnswered) {
      setStatusMessage('请完成全部题目后再提交测验。')
      return
    }
    if (!activeTestId) return
    setIsSubmitting(true)
    try {
      const result = await submitStudentTest(activeTestId, { user_answers: answers })
      setQuizResult(result)
      const passed = result.score >= activeQuizPassScore
      setStatusMessage(passed
        ? '测验已通过，下一章节已解锁。'
        : `本次得分 ${result.score}，未达到 ${activeQuizPassScore} 分及格线；下一章节仍保持锁定。`)
      await loadPaths(activePlan?.id)
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '测验提交失败，请重试。'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleAnswer(questionId: string, answer: string) {
    setAnswers((current) => ({ ...current, [questionId]: answer }))
  }

  function closeStepDialog() {
    setSelectedStep(null)
    setExerciseOpen(false)
    setExercises([])
    setAnswers({})
    setQuizResult(null)
    setActiveTestId(null)
    setActiveQuizStepId(null)
  }

  async function retryCurrentStepQuiz() {
    setExerciseOpen(false)
    setExercises([])
    setAnswers({})
    setQuizResult(null)
    setActiveTestId(null)
    await handleNextStep()
  }

  useEffect(() => {
    void loadPaths()
    void loadKnowledgeDocuments()
    const handleKnowledgeUpdated = () => void loadKnowledgeDocuments(true)
    window.addEventListener('student-learning-path-knowledge-updated', handleKnowledgeUpdated)
    return () => window.removeEventListener('student-learning-path-knowledge-updated', handleKnowledgeUpdated)
  }, [])

  return (
    <div data-testid="external-student-study-plan">
      <PageShell
        className="study-plan-page"
        prismVariant="right"
        navUserLabel="学习路径"
        navUserDescription="个性化路径规划"
      >
        <section className="study-workbench">
          <aside className="study-left-column">
            <header className="study-page-heading">
              <h1>个性化学习路径</h1>
              <p>根据你的学习画像定制，科学规划学习步骤。</p>
            </header>

            <GlassPanel className="study-create-panel">
              <h2 className="student-section-title">+ 创建学习路径</h2>
              <form onSubmit={handleCreatePlan}>
                <input
                  className="student-field"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="输入学习主题"
                  aria-label="输入学习主题"
                />
                <div className="study-knowledge-source">
                  <span className="study-knowledge-label">选择生成知识来源（支持多选）</span>
                  <KnowledgeDocumentMultiSelect
                    documents={knowledgeDocuments}
                    selectedIds={selectedDocumentIds}
                    disabled={isGenerating}
                    loading={knowledgeLoading}
                    emptyText="个人知识库暂无已入库资料，可先上传资料。"
                    ariaLabel="选择学习路径知识库文件"
                    onChange={setSelectedDocumentIds}
                  />
                  {knowledgeError ? <span className="study-knowledge-error" role="alert">{knowledgeError}</span> : null}
                  <div className="study-knowledge-actions">
                    <button type="button" disabled={isGenerating} onClick={() => window.dispatchEvent(new Event('student-learning-path-upload-open'))}>
                      上传资料
                    </button>
                    {selectedDocumentIds.length ? <button type="button" disabled={isGenerating} onClick={() => setSelectedDocumentIds([])}>清空</button> : null}
                    <button type="button" disabled={isGenerating || knowledgeLoading} onClick={() => void loadKnowledgeDocuments(true)}>
                      {knowledgeLoading ? '刷新中…' : '刷新并选择最新就绪资料'}
                    </button>
                  </div>
                </div>
                <PrimaryButton isLoading={isGenerating} type="submit">
                  生成路径
                </PrimaryButton>
              </form>
              <GenerationProgress
                visible={simulatedProgress.visible}
                title={topic.trim() || '个性化学习路径'}
                subtitle="规划学习阶段"
                statusText={generationFailed ? '学习路径生成未完成，请检查输入后重试。' : statusMessage}
                percent={simulatedProgress.percent}
                state={simulatedProgress.state}
                variant="compact"
                dataTestId="study-plan-generation-progress"
              />
              <p className={errorMessage ? 'study-error-message' : 'study-status-message'}>
                {errorMessage || statusMessage || '创建后将自动进入路径详情。'}
              </p>
            </GlassPanel>

            <section className="study-list-section" aria-label="我的学习路径">
              <h2 className="student-section-title">
                我的学习路径
                <button type="button" onClick={() => loadPaths()}>
                  刷新
                </button>
              </h2>
              <div className="study-plan-list" aria-busy={isLoading}>
                {isLoading ? <p className="study-loading">正在加载学习路径...</p> : null}
                {!isLoading && !planCards.length ? (
                  <p className="study-empty-state">暂无学习路径，可以先创建个性化学习路径。</p>
                ) : null}
                {planCards.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    active={activePlan?.id === plan.id}
                    onClick={() => handleOpenPlan(plan.id)}
                  />
                ))}
              </div>
            </section>
          </aside>

          <section className="study-center-column" aria-label="学习路径详情">
            {activePlan ? (
              <GlassPanel className="study-detail-panel">
                <header className="study-detail-header">
                  <h2>{activePlan.title}</h2>
                  <button
                    type="button"
                    aria-label="关闭路径详情"
                    onClick={() => {
                      setActivePlan(null)
                      setExerciseOpen(false)
                    }}
                  >
                    ×
                  </button>
                </header>

                <div className="study-detail-summary">
                  <ProgressRing
                    value={clampPercent(activePlan.completion_rate)}
                    completed={completedSteps}
                    total={activeSteps.length}
                  />
                  <div className="study-detail-meta">
                    <p>
                      {activePlan.topic || activePlan.title}：当前处于第 {Math.max(1, activePlan.current_step + 1)} 步，
                      共 {activeSteps.length} 个阶段。
                    </p>
                    <dl>
                      <div>
                        <dt>总步骤</dt>
                        <dd>{activeSteps.length}</dd>
                      </div>
                      <div>
                        <dt>预计总时长</dt>
                        <dd>{totalMinutes} 分钟</dd>
                      </div>
                      <div>
                        <dt>创建时间</dt>
                        <dd>{formatDate(activePlan.created_at)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="study-step-list">
                  {activeSteps.length ? (
                    activeSteps.map((step) => <StepBlock key={step.id} step={step} pathId={activePlan.id} onOpen={() => setSelectedStep(step)} />)
                  ) : (
                    <p className="study-empty-state">当前路径暂未生成步骤，可创建新的学习路径。</p>
                  )}
                </div>

                <footer className="study-detail-actions">
                  <SecondaryButton onClick={() => setActivePlan(null)}>关闭</SecondaryButton>
                  <span>点击当前章节标题，在弹窗内完成学习和测验。</span>
                </footer>
              </GlassPanel>
            ) : (
              <GlassPanel className="study-empty-detail">
                <h2>选择一条学习路径</h2>
                <p>点击左侧路径卡片后，中间会显示步骤、进度和阶段小测入口。</p>
              </GlassPanel>
            )}
          </section>

          <aside className="study-right-column">
            <ExercisePanel
              open={false}
              exercises={[]}
              currentStep={currentStep}
              answers={{}}
              isSubmitting={false}
              result={null}
              onClose={() => undefined}
              onAnswer={handleAnswer}
              onSubmit={handleSubmitExercises}
            />
          </aside>
        </section>
        {selectedStep ? (
          <div className="study-step-dialog-backdrop" role="presentation" onClick={closeStepDialog}>
            <section className="study-step-dialog" role="dialog" aria-modal="true" aria-label={selectedStep.title} onClick={(event) => event.stopPropagation()}>
              <header><div><small>第 {selectedStep.order} 章</small><h2>{selectedStep.title}</h2></div><button type="button" aria-label="关闭章节学习" onClick={closeStepDialog}>×</button></header>
              {selectedStep.rawStatus === 'locked' ? (
                <div className="study-step-locked-notice" role="status">
                  <strong>本章节尚未解锁</strong>
                  <p>请先完成上一章节学习，并在章节测验中达到及格分数。</p>
                </div>
              ) : (
                <>
                  <section className="study-step-learning-stage" aria-label="章节学习内容">
                    <p><strong>本章知识点</strong></p>
                    <div className="study-step-learning-content">{selectedStep.content}</div>
                    <p><strong>学习目标：</strong>{selectedStep.goal}</p>
                    <p><strong>预计学习时间：</strong>{selectedStep.duration} 分钟</p>
                  </section>
                  {exerciseOpen && activeQuizStepId === selectedStep.dbId ? (
                    <section className="study-step-quiz-stage" aria-label="章节测验">
                      <ExercisePanel
                        open
                        exercises={exercises}
                        currentStep={selectedStep}
                        answers={answers}
                        isSubmitting={isSubmitting}
                        result={quizResult}
                        onClose={closeStepDialog}
                        onAnswer={handleAnswer}
                        onSubmit={handleSubmitExercises}
                      />
                      {quizResult && quizResult.score < activeQuizPassScore ? (
                        <div className="study-quiz-retry">
                          <p>未达到 {activeQuizPassScore} 分，下一章节仍锁定。复习错题后可重新测验。</p>
                          <PrimaryButton isLoading={stepBusy} onClick={retryCurrentStepQuiz}>重新学习并测验</PrimaryButton>
                        </div>
                      ) : null}
                    </section>
                  ) : (
                    <footer>
                      <SecondaryButton onClick={closeStepDialog}>稍后学习</SecondaryButton>
                      {selectedStep.dbId === currentStepRaw?.id && currentStepRaw?.status !== 'completed' ? (
                        <PrimaryButton isLoading={stepBusy} onClick={handleNextStep}>
                          {currentStepRaw?.status === 'quiz_required' ? '继续本章测验' : '完成学习并开始测验'}
                        </PrimaryButton>
                      ) : null}
                    </footer>
                  )}
                </>
              )}
            </section>
          </div>
        ) : null}
      </PageShell>
    </div>
  )
}
