<template>
  <div ref="mountEl" class="external-react-page-host" data-vue-wrapper="auth-loading" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { mountPrismExternalPage } from '@/external/prism_admin/mount'

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

onMounted(() => {
  if (mountEl.value) {
    unmount = mountPrismExternalPage(mountEl.value, 'loading')
  }
})

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
