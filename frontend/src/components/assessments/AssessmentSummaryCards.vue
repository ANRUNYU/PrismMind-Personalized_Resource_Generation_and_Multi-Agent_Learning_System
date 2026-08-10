<template>
  <div class="dashboard-grid dashboard-grid--four">
    <StatCard title="评估记录" :value="summary?.total_assessments ?? 0" subtitle="累计记录数" :icon="DataAnalysis" />
    <StatCard title="平均分" :value="scoreText(summary?.average_score)" subtitle="全部评估平均" :icon="TrendCharts" type="success" />
    <StatCard title="最近得分" :value="scoreText(summary?.latest_score)" subtitle="最近一次评估" :icon="Aim" type="warning" />
    <StatCard title="薄弱主题" :value="summary?.weak_topics?.length ?? 0" subtitle="需要重点关注" :icon="Warning" type="info" />
  </div>
</template>

<script setup lang="ts">
import { Aim, DataAnalysis, TrendCharts, Warning } from '@element-plus/icons-vue'

import StatCard from '@/components/common/StatCard.vue'
import type { AssessmentSummary } from '@/types/assessment'

defineProps<{
  summary?: AssessmentSummary | null
}>()

function scoreText(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return Math.round(Number(value))
}
</script>
