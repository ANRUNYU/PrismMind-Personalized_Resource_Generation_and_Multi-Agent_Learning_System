<template>
  <section class="generation-result">
    <div class="generation-result__head">
      <div>
        <span>{{ result?.artifact_type || 'artifact' }}</span>
        <h2>{{ result?.title || '生成结果预览' }}</h2>
      </div>
      <div class="generation-result__actions">
        <el-tag v-if="result?.artifact_id" type="success">ID {{ result.artifact_id }}</el-tag>
        <el-button :disabled="!result?.content" @click="$emit('clear')">清空</el-button>
      </div>
    </div>

    <MarkdownViewer :content="result?.content || ''" />
    <QualityAnalysisPanel :analysis="result?.quality_analysis" />
  </section>
</template>

<script setup lang="ts">
import QualityAnalysisPanel from '@/components/common/QualityAnalysisPanel.vue'
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue'
import type { TeacherGenerationResponse } from '@/api/teacher'

defineProps<{
  result?: TeacherGenerationResponse | null
}>()

defineEmits<{
  clear: []
}>()
</script>
