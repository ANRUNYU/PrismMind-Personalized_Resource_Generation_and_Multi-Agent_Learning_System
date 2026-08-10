import type { QualityAnalysis } from '@/types/qualityAnalysis'
import type { StudentExerciseRead, StudentExerciseSubmitResponse } from '@/types/studentExercise'
import type { QuestionResult, TestAnswerValue, TestQuestion } from '@/types/test'
import { formatDateTime } from '@/utils/format'

import type { ExerciseActionNotice, ExerciseCardModel } from './types'

interface DetailPanelProps {
  exercise: ExerciseCardModel | null
  detail: StudentExerciseRead | null
  answers: Record<string, TestAnswerValue>
  loading: boolean
  submitting: boolean
  working: boolean
  submitResult: StudentExerciseSubmitResponse | null
  notice: ExerciseActionNotice | null
  onStart: () => void
  onSubmit: () => void
  onFavorite: () => void
  onComplete: () => void
  onDelete: () => void
  onAnswerChange: (question: TestQuestion, value: TestAnswerValue) => void
}

function answerToText(value: unknown) {
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'boolean') return value ? '正确' : '错误'
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function formatQuestionType(value?: string | null) {
  const labels: Record<string, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    true_false: '判断题',
    short_answer: '简答题'
  }
  return value ? labels[value] || value : '-'
}

function formatDifficulty(value?: string | null) {
  const labels: Record<string, string> = {
    easy: '基础',
    medium: '中等',
    hard: '困难',
    mixed: '综合'
  }
  return value ? labels[value] || value : '-'
}

function formatExerciseStatus(value?: string | null) {
  const labels: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    submitted: '已提交',
    graded: '已评分',
    completed: '已完成',
    published: '待练习',
    closed: '已结束'
  }
  return value ? labels[value] || value : '-'
}

function QualityBlock({ analysis }: { analysis?: QualityAnalysis | Record<string, unknown> | null }) {
  if (!analysis) return null
  const data = analysis as Partial<QualityAnalysis>
  return (
    <section className="analysis-preview">
      <strong>学习质量反馈</strong>
      <div className="detail-metrics">
        <span>
          <small>覆盖度</small>
          <strong>{Math.round(Number(data.coverage?.coverage_rate || 0) * 100)}%</strong>
        </span>
        <span>
          <small>深度</small>
          <strong>{data.depth?.score ?? '-'}</strong>
        </span>
      </div>
      {data.confidence ? <p>置信度：{data.confidence.level || data.confidence.score || '-'}</p> : null}
      {data.suggestions?.length ? <p>{data.suggestions.slice(0, 2).join('；')}</p> : null}
    </section>
  )
}

function QuestionBlock({
  question,
  index,
  answer,
  disabled,
  submitted,
  result,
  onChange
}: {
  question: TestQuestion
  index: number
  answer?: TestAnswerValue
  disabled: boolean
  submitted: boolean
  result?: QuestionResult
  onChange: (value: TestAnswerValue) => void
}) {
  const options = question.options || []

  return (
    <article className="exercise-question">
      <div className="exercise-question-heading">
        <h4>
          {index + 1}. {question.stem}
        </h4>
        <span>
          {formatQuestionType(question.question_type)} · {question.score ?? 0} 分
        </span>
      </div>

      {question.knowledge_points?.length ? (
        <div className="tag-row">
          {question.knowledge_points.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}

      {options.length ? (
        <div className="answer-options">
          {options.map((option) => {
            const checked =
              question.question_type === 'multiple_choice'
                ? Array.isArray(answer) && answer.includes(option.key)
                : answer === option.key
            return (
              <label key={option.key}>
                <input
                  checked={checked}
                  disabled={disabled}
                  name={question.id}
                  type={question.question_type === 'multiple_choice' ? 'checkbox' : 'radio'}
                  onChange={(event) => {
                    if (question.question_type === 'multiple_choice') {
                      const previous = Array.isArray(answer) ? answer : []
                      onChange(event.target.checked ? [...previous, option.key] : previous.filter((item) => item !== option.key))
                    } else {
                      onChange(option.key)
                    }
                  }}
                />
                <span>
                  {option.key}. {option.text}
                </span>
              </label>
            )
          })}
        </div>
      ) : question.question_type === 'true_false' ? (
        <select disabled={disabled} value={String(answer ?? '')} onChange={(event) => onChange(event.target.value === 'true')}>
          <option value="">请选择</option>
          <option value="true">正确</option>
          <option value="false">错误</option>
        </select>
      ) : (
        <textarea disabled={disabled} value={String(answer ?? '')} placeholder="请输入你的作答" onChange={(event) => onChange(event.target.value)} />
      )}

      {submitted && result ? (
        <div className="question-result">
          <strong>
            得分：{result.score}/{result.max_score}
          </strong>
          <p>{result.analysis || '暂无解析'}</p>
          <p>参考答案：{answerToText(result.correct_answer)}</p>
        </div>
      ) : null}
    </article>
  )
}

export default function DetailPanel({
  exercise,
  detail,
  answers,
  loading,
  submitting,
  working,
  submitResult,
  notice,
  onStart,
  onSubmit,
  onFavorite,
  onComplete,
  onDelete,
  onAnswerChange
}: DetailPanelProps) {
  if (!exercise) {
    return (
      <aside className="detail-panel exercise-detail-panel">
        <span className="detail-kicker">习题详情</span>
        <h2>等待选择习题</h2>
        <p>点击左侧习题卡片后，将在这里查看题目要求、作答区、解析与学习反馈。</p>
      </aside>
    )
  }

  const currentDetail = detail || exercise.detail
  const status = currentDetail?.status || exercise.status
  const submitted = ['submitted', 'graded', 'completed'].includes(String(status)) || Boolean(submitResult)
  const canAnswer = status === 'in_progress'
  const canStart = !['in_progress', 'submitted', 'graded', 'completed', 'closed'].includes(String(status))
  const questionResults = submitResult?.question_results || currentDetail?.question_results || []
  const score = submitResult?.score ?? currentDetail?.score ?? exercise.score
  const maxScore = submitResult?.max_score ?? currentDetail?.total_score ?? exercise.total_score
  const questions = currentDetail?.questions || []
  const isPersonal = exercise.source === 'personal'

  return (
    <aside className="detail-panel exercise-detail-panel" data-testid="external-student-exercises-detail">
      <span className="detail-kicker">{exercise.category}</span>
      <h2>{exercise.title}</h2>
      <p>{exercise.description || currentDetail?.description || '这是一项可用于巩固近期学习内容的练习。'}</p>

      <div className="detail-metrics">
        <span>
          <small>来源</small>
          <strong>{exercise.course_name || (isPersonal ? '个人习题库' : '课程练习')}</strong>
        </span>
        <span>
          <small>难度</small>
          <strong>{formatDifficulty(exercise.difficulty)}</strong>
        </span>
        <span>
          <small>状态</small>
          <strong>{exercise.status_label || formatExerciseStatus(status)}</strong>
        </span>
        <span>
          <small>得分</small>
          <strong>{score === null || score === undefined ? '-' : `${score}/${maxScore}`}</strong>
        </span>
      </div>

      <div className="tag-row">
        {exercise.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <section className="analysis-preview">
        <strong>作答要求</strong>
        <p>
          {exercise.category} · {currentDetail?.question_count ?? exercise.question_count} 题 · 总分 {currentDetail?.total_score ?? exercise.total_score}
        </p>
        <p>更新时间：{formatDateTime(currentDetail?.updated_at || exercise.updated_at)}</p>
        {exercise.due_at ? <p>截止时间：{formatDateTime(exercise.due_at)}</p> : null}
      </section>

      <QualityBlock analysis={submitResult?.quality_analysis || currentDetail?.quality_analysis} />

      {notice ? <div className={`exercise-action-notice is-${notice.type}`}>{notice.message}</div> : null}
      {loading ? <div className="exercise-loading">正在加载练习详情</div> : null}

      {questions.length ? (
        <section className="exercise-answer-sheet">
          <strong>{canAnswer ? '开始作答' : submitted ? '作答结果' : '题目预览'}</strong>
          {!canAnswer && !submitted ? <p className="helper-note">点击“开始作答”后即可填写答案。</p> : null}
          {questions.map((question, index) => (
            <QuestionBlock
              answer={answers[question.id]}
              disabled={!canAnswer}
              index={index}
              key={question.id}
              question={question}
              result={questionResults.find((item) => item.question_id === question.id)}
              submitted={submitted}
              onChange={(value) => onAnswerChange(question, value)}
            />
          ))}
        </section>
      ) : (
        <section className="analysis-preview">
          <strong>暂无题目内容</strong>
          <p>这项练习还没有可展示的题目，请刷新后再试。</p>
        </section>
      )}

      {submitResult ? (
        <section className="analysis-preview">
          <strong>
            提交反馈：{submitResult.score}/{submitResult.max_score}
          </strong>
          <p>{submitResult.analysis}</p>
          <p>{submitResult.feedback}</p>
        </section>
      ) : null}

      <div className="action-grid">
        {canStart ? (
          <button className="primary-action" disabled={loading || working} type="button" onClick={onStart}>
            开始作答
          </button>
        ) : canAnswer ? (
          <button className="primary-action" disabled={submitting || loading} type="button" onClick={onSubmit}>
            {submitting ? '提交中...' : '提交答案'}
          </button>
        ) : (
          <button className="primary-action" disabled type="button">
            已完成
          </button>
        )}
        {isPersonal ? (
          <>
            <button className="secondary-action" disabled={working} type="button" onClick={onFavorite}>
              {exercise.is_favorite ? '取消收藏' : '收藏'}
            </button>
            <button className="secondary-action" disabled={working || status === 'completed'} type="button" onClick={onComplete}>
              标记完成
            </button>
            <button className="secondary-action" disabled={working} type="button" onClick={onDelete}>
              删除习题
            </button>
          </>
        ) : null}
      </div>
    </aside>
  )
}
