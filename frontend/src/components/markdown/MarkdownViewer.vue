<template>
  <div class="markdown-viewer">
    <div v-if="showToolbar" class="markdown-viewer__toolbar">
      <span>{{ wordCount }} 字符</span>
      <el-button size="small" :icon="CopyDocument" @click="copySource">复制 Markdown</el-button>
    </div>
    <div v-if="content" class="markdown-body" v-html="html"></div>
    <EmptyState v-else title="暂无内容" description="请求成功后，生成的 Markdown 会显示在这里。" />
  </div>
</template>

<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import { renderMarkdown } from '@/utils/markdown'

const props = withDefaults(
  defineProps<{
    content?: string
    showToolbar?: boolean
  }>(),
  {
    content: '',
    showToolbar: true
  }
)

const html = computed(() => renderMarkdown(props.content || ''))
const wordCount = computed(() => (props.content || '').length)

async function copySource() {
  if (!props.content) return
  await navigator.clipboard.writeText(props.content)
  ElMessage.success('Markdown 已复制')
}
</script>
