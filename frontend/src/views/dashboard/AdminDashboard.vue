<template>
  <div ref="mountEl" class="external-react-page-host external-react-page-host--main" data-vue-wrapper="admin-dashboard" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountPrismExternalPage } from '@/external/prism_admin/mount'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (mountEl.value) {
    unmount = mountPrismExternalPage(mountEl.value, 'admin-dashboard')
  }
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
