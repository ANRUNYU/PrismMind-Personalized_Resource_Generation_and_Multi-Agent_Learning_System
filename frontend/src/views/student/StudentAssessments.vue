<template>
  <div ref="mountEl" class="external-react-page-host external-react-page-host--main" data-vue-wrapper="student-assessments" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountStudentExternalPage } from '@/external/student/mount'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (mountEl.value) {
    unmount = mountStudentExternalPage(mountEl.value, 'student-assessments')
  }
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
