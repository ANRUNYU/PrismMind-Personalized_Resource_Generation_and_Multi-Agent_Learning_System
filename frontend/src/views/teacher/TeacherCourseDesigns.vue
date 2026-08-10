<template>
  <div
    ref="mountEl"
    class="external-react-page-host external-react-page-host--curriculum-design"
    data-vue-wrapper="teacher-course-designs"
  />
  <TeacherKnowledgeUploadDialog />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountTeacherCurriculumDesign } from '@/external/teacher/curriculum_design/mount'
import TeacherKnowledgeUploadDialog from '@/components/teacher/TeacherKnowledgeUploadDialog.vue'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (!mountEl.value) return
  unmount = mountTeacherCurriculumDesign(mountEl.value)
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
