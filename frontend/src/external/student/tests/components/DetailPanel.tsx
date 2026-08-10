import type { QuestionResult, TestAnswerValue, TestDetail, TestQuestion, TestSubmitResponse } from '@/types/test'
import QualityAnalysisReport from '../../shared/QualityAnalysisReport'

import type { TestCardModel } from '../types'

function answerToText(value: unknown) {
  if (Array.isArray(value)) return value.join('、')
  if (typeof value === 'boolean') return value ? '正确' : '错误'
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
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
    <article className="test-question-card">
      <div className="test-question-heading">
        <h4>
          {index + 1}. {question.stem}
        </h4>
        <span>{question.score ?? 0} 分</span>
      </div>
      {question.knowledge_points?.length ? (
        <div className="test-question-tags">
          {question.knowledge_points.map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </div>
      ) : null}

      {options.length ? (
        <div className="test-answer-options">
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
        <div className="test-question-result">
          <strong>
            得分：{result.score}/{result.max_score}
          </strong>
          <p>{result.analysis || '暂无解析'}</p>
          <p>标准答案：{answerToText(result.correct_answer)}</p>
        </div>
      ) : null}
    </article>
  )
}

export default function DetailPanel({
  test,
  detail,
  status,
  loading,
  answers,
  submitResult,
  actionBusy,
  onCreate,
  onStart,
  onSubmit,
  onAnswerChange,
  onRefresh
}: {
  test: TestCardModel | null
  detail: TestDetail | null
  status: string
  loading: boolean
  answers: Record<string, TestAnswerValue>
  submitResult: TestSubmitResponse | null
  actionBusy: boolean
  onCreate: () => void
  onStart: () => void
  onSubmit: () => void
  onAnswerChange: (question: TestQuestion, value: TestAnswerValue) => void
  onRefresh: () => void
}) {
  if (!test) {
    return (
      <aside className="detail-panel test-detail-panel">
        <span className="detail-kicker">测试详情</span>
        <h2>等待选择测试</h2>
        <p>滚轮切换或点击堆叠测试后，右侧详情会独立展示。</p>
        <button className="primary-action" type="button" onClick={onCreate}>
          生成测试
        </button>
      </aside>
    )
  }

  const isSubmitted = detail?.status === 'submitted' || Boolean(submitResult)
  const canAnswer = detail?.status === 'in_progress'
  const quality = submitResult?.quality_analysis || detail?.quality_analysis
  const questionResults = submitResult?.question_results || detail?.question_results || []

  return (
    <aside className="detail-panel test-detail-panel">
      <div className="detail-heading-row">
        <span className="detail-kicker">测试详情</span>
        <span className="favorite-state">{test.favorite ? '★ 已收藏' : '☆ 学生自测'}</span>
      </div>
      <h2>{test.title}</h2>
      <div className="meta-list">
        <span>{test.course}</span>
        <span>更新于 {test.updatedAt}</span>
        <span>创建者：{test.creator}</span>
        <span>测试模式：{test.source}</span>
      </div>

      <div className="test-detail-metrics">
        <span>
          <strong>{test.questionCount}</strong>
          题目数
        </span>
        <span>
          <strong>{test.totalScore} 分</strong>
          总分值
        </span>
        <span>
          <strong>{test.duration} 分钟</strong>
          建议时长
        </span>
        <span>
          <strong>{test.difficulty}</strong>
          难度
        </span>
      </div>

      <section className="structure-preview">
        <div>
          <strong>测试结构概览</strong>
          <button type="button" onClick={onRefresh}>
            刷新详情 ›
          </button>
        </div>
        <div className="section-bars">
          {test.sections.map((section) => (
            <span key={section.name} style={{ flexBasis: `${section.ratio}%` }}>
              {section.name} {section.ratio}%
            </span>
          ))}
        </div>
      </section>

      <div className="detail-actions">
        {detail?.status === 'generated' ? (
          <button className="secondary-action" type="button" disabled={actionBusy} onClick={onStart}>
            开始测试
          </button>
        ) : detail?.status === 'in_progress' ? (
          <button className="secondary-action" type="button" disabled={actionBusy} onClick={onSubmit}>
            提交答案
          </button>
        ) : (
          <button className="secondary-action" type="button" onClick={onRefresh}>
            查看答案
          </button>
        )}
        <button className="secondary-action" type="button" onClick={onCreate}>
          生成新测试
        </button>
        <button className="secondary-action" type="button" onClick={onRefresh}>
          刷新详情
        </button>
      </div>

      <small className="status-note">{status || '测试详情已准备就绪'}</small>

      {loading ? (
        <div className="test-loading">正在加载测试详情</div>
      ) : detail ? (
        <section className="test-answer-panel">
          <p className="answer-visibility-note">提交前隐藏标准答案，提交后展示解析与质量分析。</p>
          {isSubmitted ? (
            <div className="test-submit-summary">
              <strong>本次测试得分：{submitResult?.score ?? detail.score ?? '-'}</strong>
              <p>{submitResult?.analysis || detail.analysis || '系统已完成评分。'}</p>
              <p>{submitResult?.feedback || detail.feedback || '请根据题目解析复盘薄弱知识点。'}</p>
            </div>
          ) : null}
          <QualityAnalysisReport analysis={quality} />
          {detail.questions.map((question, index) => (
            <QuestionBlock
              key={question.id}
              answer={answers[question.id]}
              disabled={!canAnswer}
              index={index}
              question={question}
              result={questionResults.find((item) => item.question_id === question.id)}
              submitted={isSubmitted}
              onChange={(value) => onAnswerChange(question, value)}
            />
          ))}
        </section>
      ) : (
        <div className="test-loading">请选择或生成一份测试。</div>
      )}
    </aside>
  )
}
