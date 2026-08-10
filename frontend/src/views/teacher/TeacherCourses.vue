<template>
  <div ref="mountEl" class="external-react-page-host external-react-page-host--teacher-courses" data-vue-wrapper="teacher-courses" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountTeacherCourses } from '@/external/teacher/mine/my_lessons/mount'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (mountEl.value) {
    unmount = mountTeacherCourses(mountEl.value)
  }
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
