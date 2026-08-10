<template>
  <div
    ref="mountEl"
    class="external-react-page-host external-react-page-host--teacher-training-program"
    data-vue-wrapper="teacher-training-program"
  />
  <TeacherKnowledgeUploadDialog />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountTeacherTrainingPlans } from '@/external/teacher/training_program/mount'
import TeacherKnowledgeUploadDialog from '@/components/teacher/TeacherKnowledgeUploadDialog.vue'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (!mountEl.value) return
  unmount = mountTeacherTrainingPlans(mountEl.value)
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
