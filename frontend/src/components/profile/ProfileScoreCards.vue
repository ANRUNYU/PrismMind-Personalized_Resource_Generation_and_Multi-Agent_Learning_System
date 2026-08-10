<template>
  <div class="profile-score-grid">
    <article v-for="item in scoreItems" :key="item.key" class="profile-score-card">
      <span>{{ item.label }}</span>
      <strong>{{ Math.round(item.value) }}</strong>
      <el-tag :type="scoreType(item.value)">{{ scoreText(item.value) }}</el-tag>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { StudentProfile } from '@/api/profile'

const props = defineProps<{
  profile?: StudentProfile | null
}>()

const scoreItems = computed(() => [
  { key: 'knowledge_score', label: '知识掌握', value: props.profile?.knowledge_score || 0 },
  { key: 'practice_score', label: '实践能力', value: props.profile?.practice_score || 0 },
  { key: 'innovation_score', label: '创新能力', value: props.profile?.innovation_score || 0 },
  { key: 'exam_score', label: '考试表现', value: props.profile?.exam_score || 0 },
  { key: 'efficiency_score', label: '学习效率', value: props.profile?.efficiency_score || 0 },
  { key: 'quality_score', label: '学习质量', value: props.profile?.quality_score || 0 }
])

function scoreType(value: number) {
  if (value >= 80) return 'success'
  if (value >= 60) return 'warning'
  return 'danger'
}

function scoreText(value: number) {
  if (value >= 80) return '优秀'
  if (value >= 60) return '稳定'
  return '需提升'
}
</script>
