<template>
  <div ref="mountEl" class="external-react-page-host external-react-page-host--portrait" data-vue-wrapper="student-portrait" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountStudentExternalPage } from '@/external/student/mount'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (mountEl.value) {
    unmount = mountStudentExternalPage(mountEl.value, 'student-profile')
  }
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
