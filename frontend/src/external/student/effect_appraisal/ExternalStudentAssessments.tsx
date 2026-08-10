import { useEffect, useMemo, useState } from 'react'

import PageShell from '../shared/PageShell/PageShell'
import { GlassPanel, PrimaryButton, SecondaryButton } from '../shared/ui/CommonUI'
import {
  fetchAssessmentDetail,
  fetchAssessmentRecords,
  generateAssessment,
  getAssessmentResult,
  loadAssessmentRecommendations,
  loadAssessmentSummary,
  submitAssessment,
  type AssessmentItem,
  type AssessmentSummary,
} from './api'
import { GenerationProgress, useSimulatedGenerationProgress } from '@/external/shared/GenerationProgress'
import { assessmentTypeText, formatDate, splitKeywords } from '../shared/format'
import QualityAnalysisReport from '../shared/QualityAnalysisReport'
import './effect-appraisal-page.css'

const tabs = ['AI生成测试', '评估记录']

function formatTime(seconds: number) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function RecordCard({ record, onClick }: { record: AssessmentItem; onClick: () => void }) {
  const statusMap: Record<string, string> = {
    resource: '资源评估',
    path: '路径评估',
    topic: '主题评估',
    test: '测试评估',
    comprehensive: '综合评估',
  }
  const status = statusMap[record.assessment_type] || record.assessment_type
  const isDone = record.score !== null && record.score !== undefined
  return (
    <button className="effect-record-card" type="button" onClick={onClick}>
      <span className={`effect-record-icon tone-${isDone ? 'teal' : 'blue'}`}>♨</span>
      <strong>
        {record.topic || assessmentTypeText(record.assessment_type)}
        <span>
          {(record.correct_topics || []).slice(0, 3).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </span>
      </strong>
      <span className={isDone ? 'is-done' : 'is-running'}>{status}</span>
      <time>{formatDate(record.created_at)}</time>
      <i aria-hidden="true">›</i>
    </button>
  )
}

function AssessmentDialog({
  open,
  detail,
  onClose,
}: {
  open: boolean
  detail: AssessmentItem | null
  onClose: () => void
}) {
  if (!open || !detail) return null

  return (
    <div className="effect-assessment-layer" role="presentation">
      <section className="effect-assessment-modal" role="dialog" aria-modal="false" aria-labelledby="assessment-title">
        <header className="effect-assessment-header">
          <div>
            <h2 id="assessment-title">{detail.topic || assessmentTypeText(detail.assessment_type)}</h2>
            <dl>
              <div>
                <dt>评估类型</dt>
                <dd>{assessmentTypeText(detail.assessment_type)}</dd>
              </div>
              <div>
                <dt>得分</dt>
                <dd>{detail.score ?? '-'}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatDate(detail.created_at)}</dd>
              </div>
            </dl>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose}>×</button>
        </header>

        <div className="effect-question-list">
          {detail.correct_topics?.length ? (
            <article className="effect-question-block effect-topic-block">
              <div className="effect-question-content">
                <div className="effect-question-title">
                  <h3>掌握主题</h3>
                </div>
                <div className="effect-option-list">
                  {(detail.correct_topics || []).map((topic) => (
                    <label key={topic} className="is-selected">
                      <span>{topic}</span>
                    </label>
                  ))}
                </div>
              </div>
            </article>
          ) : null}
          {detail.incorrect_topics?.length ? (
            <article className="effect-question-block effect-topic-block">
              <div className="effect-question-content">
                <div className="effect-question-title">
                  <h3>薄弱主题</h3>
                </div>
                <div className="effect-option-list">
                  {(detail.incorrect_topics || []).map((topic) => (
                    <label key={topic}>
                      <span>{topic}</span>
                    </label>
                  ))}
                </div>
              </div>
            </article>
          ) : null}
        </div>

        <footer className="effect-assessment-footer">
          <span className="effect-timer">得分：{detail.score ?? '-'}</span>
          <div>
            <SecondaryButton onClick={onClose}>关闭</SecondaryButton>
          </div>
        </footer>
      </section>
    </div>
  )
}

export default function ExternalStudentAssessments() {
  const [activeTab, setActiveTab] = useState('AI生成测试')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('中等')
  const [questionCount, setQuestionCount] = useState('10')
  const [records, setRecords] = useState<AssessmentItem[]>([])
  const [selected, setSelected] = useState<AssessmentItem | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [reflection, setReflection] = useState('')
  const [selfRating, setSelfRating] = useState('')
  const [feedback, setFeedback] = useState('')
  const [summary, setSummary] = useState<AssessmentSummary | null>(null)
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assessmentDetail, setAssessmentDetail] = useState<AssessmentItem | null>(null)
  const [generationFailed, setGenerationFailed] = useState(false)
  const [generationSource, setGenerationSource] = useState<'primary' | 'secondary'>('primary')
  const simulatedProgress = useSimulatedGenerationProgress({
    active: isGenerating,
    failed: generationFailed,
    resetKey: topic
  })

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [listRes, summaryRes, recRes] = await Promise.all([
        fetchAssessmentRecords(),
        loadAssessmentSummary(),
        loadAssessmentRecommendations(5).catch(() => ({ recommendations: [] })),
      ])
      setRecords(listRes.items)
      setSummary(summaryRes)
      setRecommendations(listRes.items.length > 0 ? (recRes.recommendations || []) : [])
      if (!selected && listRes.items[0]) {
        setSelected(listRes.items[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '学习评估加载失败')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async (event: React.FormEvent) => {
    event.preventDefault()
    const source = (event.currentTarget as HTMLFormElement).dataset.generationSource
    setGenerationSource(source === 'secondary' ? 'secondary' : 'primary')
    const cleanTopic = topic.trim()
    if (!cleanTopic) {
      setStatusMessage('请输入测试主题后再生成测试。')
      return
    }
    setIsGenerating(true)
    setGenerationFailed(false)
    setError('')
    setStatusMessage('正在生成 AI 测试题目...')
    try {
      const response = await generateAssessment({
        topic: cleanTopic,
        difficulty,
        questionCount,
      })
      setTopic('')
      setStatusMessage('测试题目已生成，正在进入作答页面。完成并提交后才会生成学习效果评估。')
      setIsGenerating(false)
      await new Promise((resolve) => window.setTimeout(resolve, 650))
      window.location.assign(`/student/tests?testId=${response.testId}`)
    } catch {
      setGenerationFailed(true)
      setError('测试生成未完成，请检查输入后重试。')
      setStatusMessage('测试生成未完成，请检查输入后重试。')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleOpenRecord = async (record: AssessmentItem) => {
    setSelected(record)
    try {
      const detail = await fetchAssessmentDetail(record.id)
      if (detail) {
        setAssessmentDetail(detail)
      } else {
        setAssessmentDetail(record)
      }
      setIsDialogOpen(true)
      setStatusMessage('评估详情已加载。')
    } catch {
      setStatusMessage('加载评估详情失败。')
    }
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setAssessmentDetail(null)
  }

  const handleSubmit = async () => {
    if (!selected) return
    setIsSubmitting(true)
    try {
      const result = await submitAssessment(selected.id, {
        answers: {
          strengths: selected.correct_topics || [],
          weak_topics: selected.incorrect_topics || [],
        },
        reflection: reflection.trim() || null,
        self_rating: selfRating ? Number(selfRating) : null,
        feedback: feedback.trim() || null,
      })
      setSelected(result)
      const assessmentResult = await getAssessmentResult(selected.id)
      if (assessmentResult) {
        setStatusMessage(`评估已提交。结果：${assessmentResult.score ?? '-'}分，${assessmentResult.level}。`)
      } else {
        setStatusMessage('评估已提交，详情已更新。')
      }
      setReflection('')
      setSelfRating('')
      setFeedback('')
      setIsDialogOpen(false)
      await loadAll()
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : '评估提交失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const visibleRecords = useMemo(
    () => (activeTab === '评估记录' ? records : records.slice(0, 4)),
    [activeTab, records],
  )

  useEffect(() => {
    loadAll()
  }, [])

  return (
    <div data-testid="external-student-assessments">
      <PageShell
        className="effect-appraisal-page"
        prismVariant="right"
        navUserLabel="Learning assessment"
        navUserDescription="PrismMind assessment console"
      >
      <section className="effect-workbench">
        <aside className="effect-left-column">
          <header className="effect-heading">
            <h1>学习效果评估</h1>
            <p>AI智能生成测试题目，精准评估你的学习效果</p>
          </header>

          <div className="effect-tabs" role="tablist" aria-label="学习效果评估功能切换">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={activeTab === tab ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'AI生成测试' ? '✦' : '▤'}
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'AI生成测试' ? (
            <GlassPanel className="effect-generate-panel">
              <h2 className="student-section-title">▣ AI生成测试</h2>
              <form data-generation-source="primary" onSubmit={handleGenerate}>
                <label>
                  <span>测试主题 *</span>
                  <input
                    className="student-field"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="例如：Python基础、数据结构、机器学习"
                  />
                </label>
                <label>
                  <span>难度等级</span>
                  <select className="student-select" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                    <option>简单</option>
                    <option>中等</option>
                    <option>困难</option>
                  </select>
                </label>
                <label>
                  <span>题目数量</span>
                  <select className="student-select" value={questionCount} onChange={(event) => setQuestionCount(event.target.value)}>
                    <option value="5">5题</option>
                    <option value="10">10题</option>
                    <option value="15">15题</option>
                    <option value="20">20题</option>
                  </select>
                </label>
                <PrimaryButton type="submit" isLoading={isGenerating}>✦ AI生成测试</PrimaryButton>
              </form>
              {generationSource === 'primary' ? (
                <GenerationProgress
                  visible={simulatedProgress.visible}
                  title={topic.trim() || 'AI 学习测试'}
                  subtitle="生成测试题目"
                  statusText={generationFailed ? '测试生成未完成，请检查输入后重试。' : statusMessage}
                  percent={simulatedProgress.percent}
                  state={simulatedProgress.state}
                  variant="compact"
                  dataTestId="assessment-generation-progress"
                />
              ) : null}
              {statusMessage && <p>{statusMessage}</p>}
              {error && <div className="effect-error">{error}</div>}
            </GlassPanel>
          ) : (
            <GlassPanel className="effect-tab-summary">
              <h2>评估记录</h2>
              <p>点击右侧任意评估记录，打开对应详情查看。</p>
            </GlassPanel>
          )}
        </aside>

        <section className="effect-right-column">
          <GlassPanel className="effect-record-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 className="student-section-title">我的评估记录</h2>
              <PrimaryButton onClick={loadAll} disabled={loading} style={{ minWidth: 100 }}>
                刷新
              </PrimaryButton>
            </div>
            {loading ? (
              <div className="effect-loading">
                <span />
                <p>正在加载评估记录</p>
              </div>
            ) : records.length === 0 ? (
              <div className="effect-empty">
                <strong>暂无评估记录</strong>
                <p>创建评估或完成测试后，这里会出现评估记录。</p>
              </div>
            ) : (
              <div className="effect-record-list">
                {visibleRecords.map((record) => (
                  <RecordCard key={record.id} record={record} onClick={() => handleOpenRecord(record)} />
                ))}
              </div>
            )}
          </GlassPanel>
        </section>
      </section>

      {/* Assessment Overview */}
      <div className="effect-overview-grid" data-testid="assessment-overview">
        {loading ? (
          <div className="effect-loading" style={{ gridColumn: '1 / -1' }}>
            <span />
            <p>正在分析学习结果</p>
          </div>
        ) : summary ? (
          <>
            <div className="effect-overview-metric">
              <span>评估次数</span>
              <strong>{summary.total_assessments}</strong>
            </div>
            <div className="effect-overview-metric">
              <span>平均分</span>
              <strong>{Math.round(summary.average_score || 0)}</strong>
            </div>
            <div className="effect-overview-metric">
              <span>最新得分</span>
              <strong>{summary.latest_score ?? '-'}</strong>
            </div>
            <div className="effect-overview-metric">
              <span>强项</span>
              <strong style={{ fontSize: '0.85rem' }}>
                {(summary.strong_topics || []).slice(0, 2).join('、') || '-'}
              </strong>
            </div>
            <div className="effect-overview-metric">
              <span>薄弱项</span>
              <strong style={{ fontSize: '0.85rem' }}>
                {(summary.weak_topics || []).slice(0, 2).join('、') || '-'}
              </strong>
            </div>
          </>
        ) : (
          <div className="effect-empty" style={{ gridColumn: '1 / -1' }}>
            <strong>暂无汇总</strong>
            <p>创建评估或完成测试后，系统会汇总学习表现。</p>
          </div>
        )}
      </div>

      {/* Recommendations */}
      <GlassPanel style={{ marginBottom: 16 }}>
        <h2 className="student-section-title" style={{ marginBottom: 12 }}>学习建议</h2>
        {recommendations.length > 0 ? (
          <div className="effect-recommendation-list">
            {recommendations.map((item, idx) => (
              <article className="effect-recommendation-item" key={item.title || idx}>
                <h3>{item.title}</h3>
                <p>{item.description || item.reason}</p>
                <strong>{item.suggested_action}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className="effect-empty">
            <strong>暂无建议</strong>
            <p>积累评估数据后，系统会给出可执行建议。</p>
          </div>
        )}
      </GlassPanel>

      {/* Create Assessment */}
      <GlassPanel style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 className="student-section-title">创建评估</h2>
          <span style={{ color: 'var(--student-text-muted)', fontSize: '0.82rem', fontWeight: 650 }}>通过主题与学习证据创建评估</span>
        </div>
        <form className="effect-generate-panel" data-generation-source="secondary" onSubmit={handleGenerate} style={{ marginTop: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 11 }}>
            <label>
              <span>评估类型</span>
              <select
                className="student-select"
                value="topic"
                onChange={(event) => {
                  const formEvent = event as unknown as React.FormEvent<HTMLSelectElement>
                }}
              >
                <option value="topic">主题评估</option>
                <option value="comprehensive">综合评估</option>
                <option value="resource">资源评估</option>
                <option value="path">路径评估</option>
                <option value="test">测试评估</option>
              </select>
            </label>
            <label>
              <span>主题</span>
              <input
                className="student-field"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="例如：个性化学习资源复盘"
              />
            </label>
            <label>
              <span>分数 (0-100)</span>
              <input
                className="student-field"
                min={0}
                max={100}
                type="number"
                value={80}
                onChange={() => {}}
                placeholder="可选"
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 11, marginTop: 11 }}>
            <label>
              <span>掌握主题（每行一个）</span>
              <textarea
                className="student-textarea"
                placeholder="例如：&#10;学习画像&#10;RAG 辅导"
              />
            </label>
            <label>
              <span>薄弱主题（每行一个）</span>
              <textarea
                className="student-textarea"
                placeholder="例如：&#10;异步任务监控"
              />
            </label>
          </div>
          <div style={{ marginTop: 11 }}>
            <PrimaryButton type="submit" disabled={isGenerating}>
              {isGenerating ? '正在创建' : '创建评估'}
            </PrimaryButton>
          </div>
          {generationSource === 'secondary' ? (
            <GenerationProgress
              visible={simulatedProgress.visible}
              title={topic.trim() || '学习效果评估'}
              subtitle="生成评估内容"
              statusText={generationFailed ? '评估生成未完成，请检查输入后重试。' : statusMessage}
              percent={simulatedProgress.percent}
              state={simulatedProgress.state}
              variant="compact"
              dataTestId="assessment-generation-progress"
            />
          ) : null}
          {error && <div className="effect-error" style={{ marginTop: 10 }}>{error}</div>}
        </form>
      </GlassPanel>

      {/* Assessment Detail */}
      <GlassPanel style={{ marginBottom: 16 }}>
        <h2 className="student-section-title" style={{ marginBottom: 8 }}>评估详情</h2>
        <p style={{ color: 'var(--student-text-muted)', fontSize: '0.84rem', marginBottom: 12 }}>
          {selected?.topic || '选择一条评估'}
        </p>
        {selected ? (
          <div className="effect-detail-section">
            <div className="effect-meta-row">
              <span>{assessmentTypeText(selected.assessment_type)}</span>
              <span>得分：{selected.score ?? '-'}</span>
              <span>{formatDate(selected.created_at)}</span>
            </div>
            <p>{selected.analysis || '暂无分析内容。'}</p>
            <QualityAnalysisReport analysis={selected.quality_analysis} />
            {Array.isArray(selected.recommendations) && selected.recommendations.length > 0 && (
              <div className="effect-recommendation-list">
                {selected.recommendations.map((item, idx) => (
                  <article className="effect-recommendation-item" key={item.title || idx}>
                    <h3>{item.title}</h3>
                    <p>{item.description || item.reason}</p>
                    <strong>{item.suggested_action}</strong>
                  </article>
                ))}
              </div>
            )}
            <div className="effect-submit-box" aria-label="提交评估反馈">
              <label>
                <span>学习反思</span>
                <textarea
                  className="student-textarea"
                  value={reflection}
                  placeholder="写下本次评估后的理解、疑问或复盘结论"
                  onChange={(event) => setReflection(event.target.value)}
                />
              </label>
              <div className="effect-submit-row">
                <label>
                  <span>自评分</span>
                  <input
                    className="student-field"
                    min={0}
                    max={100}
                    type="number"
                    value={selfRating}
                    placeholder="0-100"
                    onChange={(event) => setSelfRating(event.target.value)}
                  />
                </label>
                <label>
                  <span>反馈</span>
                  <input
                    className="student-field"
                    value={feedback}
                    placeholder="对评估结果的补充反馈"
                    onChange={(event) => setFeedback(event.target.value)}
                  />
                </label>
              </div>
              <PrimaryButton onClick={handleSubmit} isLoading={isSubmitting} disabled={isSubmitting}>
                提交评估反馈
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="effect-empty">
            <strong>未选择评估</strong>
            <p>从评估记录中打开一条数据查看详情与质量分析。</p>
          </div>
        )}
      </GlassPanel>

      {/* Assessment Detail Dialog */}
      <AssessmentDialog open={isDialogOpen} detail={assessmentDetail} onClose={handleCloseDialog} />
    </PageShell>
    </div>
  )
}
