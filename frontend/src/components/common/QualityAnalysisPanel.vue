<template>
  <section v-if="analysis" class="quality-panel">
    <header><span>质量分析</span><h3>生成质量诊断报告</h3></header>

    <template v-if="isV2">
      <el-alert
        v-if="!analysis.evidence_available"
        type="info"
        :closable="false"
        show-icon
        title="本次生成没有可用的知识库证据，无法计算来源覆盖率与匹配度。"
        :description="analysis.unavailable_reason || undefined"
        data-testid="quality-no-evidence"
      />
      <template v-else>
        <div class="quality-panel__grid">
          <article><strong>来源覆盖率</strong><el-progress :percentage="percent(analysis.source_coverage)" /><small>证据关键点被生成内容覆盖的比例</small></article>
          <article><strong>来源匹配度</strong><el-progress :percentage="percent(analysis.source_match_rate)" /><small>生成段落与实际引用证据的平均语义匹配程度</small></article>
          <article><strong>诊断可信度</strong><el-progress :percentage="percent(analysis.diagnostic_confidence)" /><small>表示证据完整性与分析稳定性，不代表回答正确概率</small></article>
        </div>
        <div class="quality-panel__keypoints">
          <div class="quality-panel__section">
            <strong>已覆盖关键点 <small>{{ analysis.matched_keypoints?.length || 0 }} 项</small></strong>
            <div class="tag-list"><el-tag v-for="match in analysis.matched_keypoints || []" :key="`${match.evidence_chunk_id}-${match.keypoint}`" type="success" size="small">{{ match.keypoint }}</el-tag></div>
          </div>
          <div v-if="analysis.missing_keypoints?.length" class="quality-panel__section">
            <strong>待补充关键点 <small>{{ analysis.missing_keypoints.length }} 项</small></strong>
            <div class="tag-list"><el-tag v-for="point in analysis.missing_keypoints" :key="point" type="warning" size="small">{{ point }}</el-tag></div>
          </div>
        </div>
      </template>
      <article v-if="analysis.constraint_fulfillment !== null && analysis.constraint_fulfillment !== undefined">
        <strong>任务要求完成度</strong><el-progress :percentage="percent(analysis.constraint_fulfillment)" />
      </article>
    </template>

    <template v-else-if="analysis.coverage && analysis.depth && analysis.confidence">
      <el-alert title="历史质量分析（qa-v1）" description="该记录使用旧版请求关键词算法，仅作历史展示。" type="warning" :closable="false" />
      <div class="quality-panel__grid">
        <article><strong>旧版覆盖指标</strong><el-progress :percentage="percent(analysis.coverage.coverage_rate)" /><p>{{ analysis.coverage.explanation }}</p></article>
        <article><strong>深度</strong><p>{{ analysis.depth.actual_depth }}</p></article>
        <article><strong>旧版诊断值</strong><p>{{ percent(analysis.confidence.score) }}%</p></article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { QualityAnalysis } from '@/types/qualityAnalysis'

const props = defineProps<{ analysis?: QualityAnalysis | null }>()
const isV2 = computed(() => props.analysis?.analysis_version === 'qa-v2')
function percent(value?: number | null) { return Math.round((value ?? 0) * 100) }
</script>

<style scoped>
.quality-panel { display: grid; gap: 10px; border: 1px solid var(--el-border-color-light); border-radius: 8px; padding: 12px; }
.quality-panel header h3, .quality-panel p { margin: 0; }
.quality-panel header h3 { font-size: 16px; }
.quality-panel__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.quality-panel__grid article, .quality-panel article { display: grid; gap: 6px; border: 1px solid var(--el-border-color-lighter); border-radius: 7px; padding: 9px; }
.quality-panel__keypoints { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.quality-panel__section { display: grid; align-content: start; gap: 6px; min-width: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 7px; padding: 8px; }
.quality-panel__section > strong { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
.quality-panel__section > strong small { font-weight: 400; white-space: nowrap; }
.tag-list { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 4px; max-height: 76px; overflow: auto; padding-right: 3px; }
.tag-list :deep(.el-tag) { max-width: 150px; height: 22px; font-size: 11px; }
.tag-list :deep(.el-tag__content) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
small { color: var(--el-text-color-secondary); line-height: 1.5; }
@media (max-width: 900px) { .quality-panel__grid { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .quality-panel__keypoints { grid-template-columns: 1fr; } }
</style>
