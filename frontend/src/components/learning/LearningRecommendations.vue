<template>
  <el-card shadow="never" class="learning-recommendations">
    <template #header>
      <div class="panel-header">
        <strong>下一步建议</strong>
        <el-button size="small" :loading="loading" @click="$emit('refresh')">刷新</el-button>
      </div>
    </template>

    <EmptyState v-if="!recommendations.length" title="暂无建议" description="创建或推进学习路径后，可刷新获取下一步建议。" />
    <div v-else class="recommendation-list">
      <div v-for="item in recommendations" :key="`${item.title}-${item.suggested_action}`" class="recommendation-card">
        <strong>{{ item.title }}</strong>
        <p>{{ item.reason }}</p>
        <span>{{ item.suggested_action }}</span>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { LearningPathRecommendation } from '@/api/learningPaths'
import EmptyState from '@/components/common/EmptyState.vue'

defineProps<{
  recommendations: LearningPathRecommendation[]
  loading?: boolean
}>()

defineEmits<{
  refresh: []
}>()
</script>
