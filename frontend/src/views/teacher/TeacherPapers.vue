<template>
  <div
    ref="mountEl"
    class="external-react-page-host external-react-page-host--teacher-papers"
    data-vue-wrapper="teacher-papers"
  />
  <TeacherKnowledgeUploadDialog />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountTeacherPapers } from '@/external/teacher/test_generation/mount'
import TeacherKnowledgeUploadDialog from '@/components/teacher/TeacherKnowledgeUploadDialog.vue'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (!mountEl.value) return
  unmount = mountTeacherPapers(mountEl.value)
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
