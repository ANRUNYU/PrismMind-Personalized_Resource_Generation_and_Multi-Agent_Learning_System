<template>
  <div class="assessment-trend-chart">
    <EmptyState v-if="!points.length" title="暂无趋势数据" description="创建或完成学习评估后，这里会展示分数变化趋势。" />
    <VChart v-else class="assessment-trend-chart__canvas" :option="option" autoresize />
  </div>
</template>

<script setup lang="ts">
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed } from 'vue'
import VChart from 'vue-echarts'

import EmptyState from '@/components/common/EmptyState.vue'
import { useAppStore } from '@/stores/app'
import type { AssessmentTrendPoint } from '@/types/assessment'
import { formatDateTime } from '@/utils/format'

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{
  points?: AssessmentTrendPoint[]
}>()

const app = useAppStore()
const points = computed(() => (props.points || []).filter((item) => item.score !== null && item.score !== undefined))
const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 36, right: 18, top: 28, bottom: 36 },
  xAxis: {
    type: 'category',
    data: points.value.map((item) => formatDateTime(item.created_at)),
    axisLabel: { color: app.darkMode ? '#dbe7df' : '#334139' }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 100,
    axisLabel: { color: app.darkMode ? '#dbe7df' : '#334139' }
  },
  series: [
    {
      type: 'line',
      smooth: true,
      data: points.value.map((item) => item.score),
      areaStyle: { color: 'rgba(31, 138, 112, 0.14)' },
      lineStyle: { color: '#1f8a70', width: 2 },
      itemStyle: { color: '#1f8a70' }
    }
  ]
}))
</script>
