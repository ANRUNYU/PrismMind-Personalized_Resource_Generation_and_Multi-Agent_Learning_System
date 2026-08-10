<template>
  <div class="profile-radar-chart">
    <EmptyState v-if="!hasData" title="No radar data" description="Create a profile to render the six-dimensional radar chart." />
    <VChart v-else class="profile-radar-chart__canvas" :option="option" autoresize />
  </div>
</template>

<script setup lang="ts">
import { RadarChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { computed } from 'vue'
import VChart from 'vue-echarts'

import EmptyState from '@/components/common/EmptyState.vue'
import type { RadarChartData } from '@/api/profile'
import { useAppStore } from '@/stores/app'

use([RadarChart, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{
  radarChartData?: RadarChartData | null
}>()

const app = useAppStore()
const hasData = computed(() => Boolean(props.radarChartData?.values?.length))

const option = computed(() => ({
  tooltip: {},
  radar: {
    radius: '68%',
    indicator: props.radarChartData?.indicators || [],
    splitArea: {
      areaStyle: {
        color: ['rgba(31, 138, 112, 0.05)', 'rgba(31, 138, 112, 0.1)']
      }
    },
    axisName: {
      color: app.darkMode ? '#dbe7df' : '#334139'
    },
    splitLine: {
      lineStyle: {
        color: app.darkMode ? 'rgba(219, 231, 223, 0.2)' : 'rgba(31, 65, 49, 0.18)'
      }
    }
  },
  series: [
    {
      type: 'radar',
      data: [
        {
          name: 'Profile score',
          value: props.radarChartData?.values || [],
          areaStyle: {
            color: 'rgba(31, 138, 112, 0.22)'
          },
          lineStyle: {
            color: '#1f8a70',
            width: 2
          },
          itemStyle: {
            color: '#1f8a70'
          }
        }
      ]
    }
  ]
}))
</script>
