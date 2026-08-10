<template>
  <el-drawer :model-value="modelValue" size="56%" @update:model-value="$emit('update:modelValue', $event)">
    <template #header>
      <div class="resource-detail__header">
        <span>{{ resource?.resource_type || 'Resource' }}</span>
        <strong>{{ resource?.title || '资源详情' }}</strong>
      </div>
    </template>

    <EmptyState v-if="!resource" title="未选择资源" description="从列表中选择一个资源后可查看完整内容。" />
    <div v-else class="resource-detail">
      <div class="resource-detail__meta">
        <el-tag>{{ resource.difficulty_level || 'normal' }}</el-tag>
        <StatusTag :status="resource.is_viewed ? 'viewed' : 'unviewed'" />
        <StatusTag :status="resource.is_completed ? 'completed' : 'open'" />
        <span>{{ resource.topic }}</span>
      </div>

      <MarkdownViewer :content="resource.content" />

      <el-divider />
      <el-form label-position="top" class="resource-detail__actions">
        <el-form-item label="你的评分">
          <el-rate v-model="ratingValue" />
        </el-form-item>
        <div>
          <el-button @click="$emit('mark-viewed', resource)">标记查看</el-button>
          <el-button type="success" :disabled="resource.is_completed" @click="$emit('mark-completed', resource)">标记完成</el-button>
          <el-button type="primary" @click="$emit('rate', resource, ratingValue)">保存评分</el-button>
        </div>
      </el-form>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import type { LearningResource } from '@/api/resources'
import EmptyState from '@/components/common/EmptyState.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue'

const props = defineProps<{
  modelValue: boolean
  resource: LearningResource | null
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  'mark-viewed': [resource: LearningResource]
  'mark-completed': [resource: LearningResource]
  rate: [resource: LearningResource, rating: number]
}>()

const ratingValue = ref(5)

watch(
  () => props.resource,
  (resource) => {
    ratingValue.value = Number(resource?.user_rating || 5)
  },
  { immediate: true }
)
</script>
