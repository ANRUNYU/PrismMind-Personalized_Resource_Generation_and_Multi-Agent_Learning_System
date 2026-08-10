<template>
  <article class="chat-message" :class="`chat-message--${role}`">
    <div class="chat-message__bubble">
      <el-skeleton v-if="loading" :rows="3" animated />
      <template v-else>
        <MarkdownViewer v-if="role === 'assistant'" :content="content" />
        <p v-else>{{ content }}</p>
        <ReferenceCards v-if="role === 'assistant'" :references="references" />
      </template>
    </div>
  </article>
</template>

<script setup lang="ts">
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue'
import ReferenceCards from '@/components/tutoring/ReferenceCards.vue'
import type { TutoringReference } from '@/api/tutoring'

defineProps<{
  role: 'user' | 'assistant'
  content: string
  references?: TutoringReference[]
  loading?: boolean
}>()
</script>
