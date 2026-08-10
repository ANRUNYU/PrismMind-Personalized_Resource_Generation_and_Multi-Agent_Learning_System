<template>
  <el-card shadow="never" class="resource-card">
    <template #header>
      <div class="resource-card__head">
        <div>
          <span>{{ typeLabel }}</span>
          <strong>{{ resource.title }}</strong>
        </div>
        <StatusTag :status="resource.is_completed ? 'completed' : 'open'" />
      </div>
    </template>

    <p class="resource-card__meta">
      {{ resource.topic || '暂无主题' }} · {{ resource.difficulty_level || 'normal' }} · {{ formatDateTime(resource.created_at) }}
    </p>
    <div class="resource-card__content">
      <MarkdownViewer :content="excerpt" :show-toolbar="false" />
    </div>
    <div class="resource-card__actions">
      <StatusTag :status="resource.is_viewed ? 'viewed' : 'unviewed'" />
      <el-rate :model-value="resource.user_rating || 0" disabled size="small" />
      <el-button size="small" @click="$emit('view', resource)">详情</el-button>
      <el-button size="small" type="success" :disabled="resource.is_completed" @click="$emit('complete', resource)">
        完成
      </el-button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { resourceTypeLabels, type LearningResource, type ResourceType } from '@/api/resources'
import StatusTag from '@/components/common/StatusTag.vue'
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  resource: LearningResource
}>()

defineEmits<{
  view: [resource: LearningResource]
  complete: [resource: LearningResource]
}>()

const typeLabel = computed(() => resourceTypeLabels[props.resource.resource_type as ResourceType] || props.resource.resource_type)
const excerpt = computed(() => {
  const content = props.resource.content || ''
  return content.length > 520 ? `${content.slice(0, 520)}...` : content
})
</script>
