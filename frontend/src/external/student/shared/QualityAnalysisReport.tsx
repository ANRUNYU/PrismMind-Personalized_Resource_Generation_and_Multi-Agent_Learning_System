import type { QualityAnalysis } from '@/types/qualityAnalysis'

export function formatQualityPercent(value?: number | null) {
  return value === null || value === undefined ? '不可计算' : `${Math.round(value * 100)}%`
}

export default function QualityAnalysisReport({ analysis }: { analysis?: QualityAnalysis | null }) {
  if (!analysis) return null

  const isQaV2 = analysis.analysis_version === 'qa-v2' || typeof analysis.evidence_available === 'boolean'
  if (isQaV2 && !analysis.evidence_available) {
    return (
      <section className="test-quality-analysis test-quality-analysis--unavailable" data-testid="quality-no-evidence">
        <strong>AI 生成质量分析报告</strong>
        <p>{analysis.unavailable_reason || '本次生成没有可用的知识库证据，无法计算来源覆盖率与匹配度。'}</p>
        {analysis.warnings?.length ? (
          <ul>{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        ) : null}
      </section>
    )
  }

  if (isQaV2) {
    return (
      <section className="test-quality-analysis" data-testid="student-test-quality-v2">
        <strong>AI 生成质量分析报告</strong>
        <div className="test-quality-grid">
          <span><em>来源覆盖率</em><b>{formatQualityPercent(analysis.source_coverage)}</b></span>
          <span><em>来源匹配度</em><b>{formatQualityPercent(analysis.source_match_rate)}</b></span>
          <span><em>诊断可信度</em><b>{formatQualityPercent(analysis.diagnostic_confidence)}</b></span>
        </div>
        <p>以上指标仅基于本次实际传给模型的资料证据，不代表答案正确概率。</p>
        {analysis.evidence_sources?.length ? <p>已分析 {analysis.evidence_sources.length} 条实际知识来源。</p> : null}
        {analysis.matched_keypoints?.length ? (
          <ul>{analysis.matched_keypoints.slice(0, 5).map((item) => <li key={`${item.evidence_chunk_id}-${item.keypoint}`}>已覆盖：{item.keypoint}</li>)}</ul>
        ) : null}
      </section>
    )
  }

  return (
    <section className="test-quality-analysis">
      <strong>AI 生成质量分析报告</strong>
      <div className="test-quality-grid">
        <span><em>覆盖度</em><b>{Math.round((analysis.coverage?.coverage_rate || 0) * 100)}%</b></span>
        <span><em>深度</em><b>{analysis.depth?.score ?? '-'}</b></span>
        <span><em>置信度</em><b>{analysis.confidence?.score ?? '-'}</b></span>
      </div>
      {analysis.coverage?.explanation ? <p>{analysis.coverage.explanation}</p> : null}
      {analysis.depth?.explanation ? <p>{analysis.depth.explanation}</p> : null}
      {analysis.confidence?.explanation ? <p>{analysis.confidence.explanation}</p> : null}
      {analysis.suggestions?.length ? <ul>{analysis.suggestions.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul> : null}
    </section>
  )
}
