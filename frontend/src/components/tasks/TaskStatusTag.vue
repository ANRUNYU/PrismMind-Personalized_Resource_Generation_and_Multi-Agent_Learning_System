<template>
  <StatusTag :status="status" />
</template>

<script setup lang="ts">
import StatusTag from '@/components/common/StatusTag.vue'
import type { TaskStatus } from '@/types/task'

defineProps<{
  status: TaskStatus
}>()
</script>
