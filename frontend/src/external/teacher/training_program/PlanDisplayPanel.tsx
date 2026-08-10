import type { ReactNode } from 'react'
import SafeMarkdown from '../../shared/SafeMarkdown'

import type { TrainingPhase } from './StepIndicator'
import type { TrainingPlanGenerationResponse, TrainingPlanReference } from './trainingProgramApi'

interface PlanDisplayPanelProps {
  plan: TrainingPlanGenerationResponse | null
  phase: TrainingPhase
  onCopy: () => Promise<void>
  onExport: () => void
  onSave: () => Promise<void>
}

export default function PlanDisplayPanel({ plan, phase, onCopy, onExport, onSave }: PlanDisplayPanelProps) {
  const isLoading = phase === 'generating'

  return (
    <section
      className="training-result-panel training-plan-panel hud-panel"
      aria-label="生成的培养方案"
      data-testid="external-teacher-training-plan-result"
    >
      <header className="training-result-header">
        <div>
          <span className="training-result-title">生成的培养方案</span>
          <span className="training-result-subtitle">两阶段流程第二步：基于核心能力生成完整方案</span>
        </div>
        <span className={`training-result-signal${plan ? ' is-ready' : ''}${isLoading ? ' is-loading' : ''}`} />
      </header>

      <div className="training-result-scroll training-plan-scroll">
        {isLoading ? (
          <EmptyState title="正在生成培养方案" description="系统正在把核心技能组织为培养目标、课程模块与阶段安排。" loading />
        ) : null}

        {!isLoading && !plan ? <EmptyState title="等待方案生成" description="核心技能提取完成后，系统会继续生成培养方案预览。" /> : null}

        {!isLoading && plan ? (
          <div className="training-plan-report">
            {plan.plan.goal ? (
              <ReportBlock title="培养目标" index="01">
                <p>{plan.plan.goal}</p>
              </ReportBlock>
            ) : null}

            {plan.plan.coreAbilities.length ? (
              <ReportBlock title="核心能力" index="02">
                <div className="training-ability-grid">
                  {plan.plan.coreAbilities.map((ability) => (
                    <span key={ability}>{ability}</span>
                  ))}
                </div>
              </ReportBlock>
            ) : null}

            {plan.plan.modules.length ? (
              <ReportBlock title="课程模块" index="03">
                <div className="training-plan-sections">
                  {plan.plan.modules.map((module) => (
                    <section key={module.title}>
                      <strong>{module.title}</strong>
                      <p>{module.content}</p>
                    </section>
                  ))}
                </div>
              </ReportBlock>
            ) : null}

            {plan.plan.stages.length ? (
              <ReportBlock title="阶段安排" index="04">
                <div className="training-plan-sections">
                  {plan.plan.stages.map((stage) => (
                    <section key={stage.title}>
                      <strong>{stage.title}</strong>
                      <p>{stage.content}</p>
                    </section>
                  ))}
                </div>
              </ReportBlock>
            ) : null}

            {plan.plan.practiceProjects.length ? (
              <ReportBlock title="实践项目" index="05">
                <ol className="training-project-list">
                  {plan.plan.practiceProjects.map((project) => (
                    <li key={project}>{project}</li>
                  ))}
                </ol>
              </ReportBlock>
            ) : null}

            {plan.plan.assessment ? (
              <ReportBlock title="评估方式" index="06">
                <p>{plan.plan.assessment}</p>
              </ReportBlock>
            ) : null}

            <QualityPanel plan={plan} />
            <MarkdownBlock content={plan.plan.markdown || plan.content} />
            <ReferenceList references={plan.references} warnings={plan.warnings} />

            <div className="training-result-actions">
              <button className="panel-action" type="button" onClick={() => void onSave()}>
                确认保存
              </button>
              <button className="panel-action" type="button" onClick={() => void onCopy()}>
                复制
              </button>
              <button className="panel-action" type="button" onClick={onExport}>
                导出 Markdown
              </button>
              {plan.artifact_id ? (
                <a className="panel-action" href={`/teacher/artifacts/${plan.artifact_id}`}>
                  查看详情
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ReportBlock({ title, index, children }: { title: string; index: string; children: ReactNode }) {
  return (
    <article className="training-report-block">
      <div className="training-report-heading">
        <span>{index}</span>
        <strong>{title}</strong>
      </div>
      {children}
    </article>
  )
}

function EmptyState({ title, description, loading = false }: { title: string; description: string; loading?: boolean }) {
  return (
    <div className={`training-empty-state${loading ? ' is-loading' : ''}`}>
      <span className="training-empty-orbit" aria-hidden="true" />
      <strong>{title}</strong>
      <small>{description}</small>
    </div>
  )
}

function QualityPanel({ plan }: { plan: TrainingPlanGenerationResponse }) {
  const analysis = plan.quality_analysis
  if (!analysis) {
    return (
      <div className="quality-panel" data-testid="external-teacher-training-quality">
        <strong>质量分析</strong>
        <span>本次结果暂未包含质量分析。</span>
      </div>
    )
  }

  const coverage = Number(analysis.coverage?.coverage_rate || 0)
  const coveragePercent = Math.round(coverage <= 1 ? coverage * 100 : coverage)
  return (
    <div className="quality-panel" data-testid="external-teacher-training-quality">
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
        <strong>{formatConfidenceLevel(analysis.confidence?.level)}</strong>
      </div>
      {analysis.suggestions?.length ? <p>{analysis.suggestions.slice(0, 2).join('；')}</p> : null}
    </div>
  )
}

function formatConfidenceLevel(level?: string | null) {
  const normalized = String(level || '').trim().toLowerCase()
  if (!normalized) return '-'
  if (normalized.includes('high') || normalized.includes('高')) return '高'
  if (normalized.includes('medium') || normalized.includes('中')) return '中'
  if (normalized.includes('low') || normalized.includes('低')) return '低'
  return level || '-'
}

function MarkdownBlock({ content }: { content: string }) {
  if (!content.trim()) return null
  return <SafeMarkdown content={content} className="training-markdown" />
}

function ReferenceList({ references, warnings }: { references: TrainingPlanReference[]; warnings: string[] }) {
  if (!references.length && !warnings.length) return null
  return (
    <div className="reference-result-list">
      {references.length ? (
        <div data-testid="external-teacher-training-references">
          <strong>知识引用</strong>
          {references.slice(0, 6).map((reference, index) => (
            <article key={`${reference.source_type}-${reference.file_id || reference.document_id || index}`}>
              <span>{reference.source_filename || `资料 ${reference.document_id || reference.file_id || index + 1}`}</span>
              <p>{reference.excerpt || reference.source_type}</p>
            </article>
          ))}
        </div>
      ) : null}
      {warnings.length ? (
        <div data-testid="external-teacher-training-warnings">
          <strong>生成提示</strong>
          <ul className="training-warning-list">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
