<template>
  <div ref="mountEl" class="external-react-page-host external-react-page-host--main" data-vue-wrapper="teacher-dashboard" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountTeacherMainDashboard } from '@/external/teacher/teacher_main/mount'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (mountEl.value) {
    unmount = mountTeacherMainDashboard(mountEl.value)
  }
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
