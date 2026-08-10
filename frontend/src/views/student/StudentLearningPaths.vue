<template>
  <el-dialog v-model="uploadDialogVisible" append-to-body title="上传知识资料" width="min(720px, calc(100vw - 32px))">
    <FileUploadPanel auto-ingest @uploaded="notifyUploaded" />
  </el-dialog>
  <div ref="mountEl" class="external-react-page-host external-react-page-host--main" data-vue-wrapper="student-learning-paths" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import FileUploadPanel from '@/components/upload/FileUploadPanel.vue'
import { mountStudentExternalPage } from '@/external/student/mount'

const mountEl = ref<HTMLElement | null>(null)
const uploadDialogVisible = ref(false)
let unmount: (() => void) | null = null

function openUploadDialog() {
  uploadDialogVisible.value = true
}

function notifyUploaded(file: { id: number; knowledge_document_id?: number | null; parse_status?: string; knowledge_ingest_status?: string | null }) {
  window.dispatchEvent(new CustomEvent('student-learning-path-knowledge-updated', { detail: file }))
}

onMounted(() => {
  window.addEventListener('student-learning-path-upload-open', openUploadDialog)
  if (mountEl.value) {
    unmount = mountStudentExternalPage(mountEl.value, 'student-learning-paths')
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('student-learning-path-upload-open', openUploadDialog)
  unmount?.()
  unmount = null
})
</script>
