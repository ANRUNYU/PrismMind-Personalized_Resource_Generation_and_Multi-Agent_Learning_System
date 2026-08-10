<template>
  <div ref="mountEl" class="external-react-page-host external-react-page-host--main" :data-vue-wrapper="`teacher-${page}`" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { mountTeacherExternalPage, type TeacherExternalGenerationPage } from '@/external/change/teacher/mount'
import type { GenerationKind } from './generationConfigs'

const props = defineProps<{
  kind: GenerationKind
}>()

const mountEl = ref<HTMLElement | null>(null)
let unmount: (() => void) | null = null

const page = computed<TeacherExternalGenerationPage>(() => {
  const pageMap: Partial<Record<GenerationKind, TeacherExternalGenerationPage>> = {
    'training-plan': 'training-program',
    exercise: 'exercises',
    paper: 'papers'
  }
  const mapped = pageMap[props.kind]
  if (!mapped) {
    throw new Error(`Unsupported external teacher generation kind: ${props.kind}`)
  }
  return mapped
})

function mount() {
  if (!mountEl.value) return
  unmount?.()
  unmount = mountTeacherExternalPage(mountEl.value, page.value)
}

onMounted(mount)

watch(page, mount)

onBeforeUnmount(() => {
  unmount?.()
  unmount = null
})
</script>
