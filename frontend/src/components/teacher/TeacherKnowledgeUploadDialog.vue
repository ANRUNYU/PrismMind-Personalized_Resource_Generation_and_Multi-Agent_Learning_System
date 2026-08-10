<template>
  <el-dialog v-model="visible" title="上传资料到知识库" width="min(720px, 92vw)" append-to-body destroy-on-close>
    <p class="teacher-upload-hint">上传后会自动解析并进入知识库；入库完成的资料会自动加入当前选择。</p>
    <FileUploadPanel auto-ingest @uploaded="handleUploaded" />
  </el-dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import type { FileAsset } from '@/api/files'
import FileUploadPanel from '@/components/upload/FileUploadPanel.vue'

const visible = ref(false)

function openDialog() {
  visible.value = true
}

function handleUploaded(file: FileAsset) {
  if (file.knowledge_ingest_status !== 'ingested' || !file.knowledge_document_id) return
  window.dispatchEvent(new CustomEvent('teacher-knowledge-updated', {
    detail: { documentId: Number(file.knowledge_document_id) }
  }))
}

onMounted(() => window.addEventListener('teacher-knowledge-upload-open', openDialog))
onBeforeUnmount(() => window.removeEventListener('teacher-knowledge-upload-open', openDialog))
</script>

<style scoped>
.teacher-upload-hint { margin: 0 0 14px; color: var(--el-text-color-secondary); line-height: 1.6; }
</style>
