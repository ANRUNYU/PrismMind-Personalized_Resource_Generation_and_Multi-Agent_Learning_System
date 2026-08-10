<template>
  <div class="empty-state">
    <el-icon class="empty-state__icon"><Document /></el-icon>
    <strong>{{ title }}</strong>
    <p>{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
import { Document } from '@element-plus/icons-vue'

withDefaults(
  defineProps<{
    title?: string
    description?: string
  }>(),
  {
    title: 'Nothing here yet',
    description: 'Create or select an item to see details.'
  }
)
</script>
