<template>
  <div
    ref="mountEl"
    class="external-react-page-host external-react-page-host--teacher-exercises"
    data-vue-wrapper="teacher-exercises"
  />
  <TeacherKnowledgeUploadDialog />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountTeacherExercises } from '@/external/teacher/exercise_generation/mount'
import TeacherKnowledgeUploadDialog from '@/components/teacher/TeacherKnowledgeUploadDialog.vue'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (!mountEl.value) return
  unmount = mountTeacherExercises(mountEl.value)
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
