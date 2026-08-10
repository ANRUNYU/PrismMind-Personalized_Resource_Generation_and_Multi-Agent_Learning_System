<template>
  <div class="tutoring-references">
    <h4>知识引用</h4>
    <el-alert
      v-if="!references?.length"
      type="info"
      :closable="false"
      title="当前回答基于通用学习策略，未返回知识库引用。"
    />
    <article v-for="(reference, index) in references" :key="index" class="reference-card">
      <span>{{ reference.source_filename || '知识片段' }}</span>
      <strong>
        {{ reference.document_id ? '课程资料' : '' }}
        {{ reference.chunk_index !== null && reference.chunk_index !== undefined ? ' / 相关片段' : '' }}
      </strong>
      <p>{{ reference.excerpt }}</p>
      <small v-if="reference.score !== null && reference.score !== undefined">相似度 {{ Number(reference.score).toFixed(4) }}</small>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { TutoringReference } from '@/api/tutoring'

defineProps<{
  references?: TutoringReference[]
}>()
</script>
