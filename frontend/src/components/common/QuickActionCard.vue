<template>
  <RouterLink :to="disabled ? '' : to" :class="['quick-action-card', { 'quick-action-card--disabled': disabled }]">
    <div class="quick-action-card__icon">
      <el-icon v-if="icon"><component :is="icon" /></el-icon>
    </div>
    <div>
      <strong>{{ title }}</strong>
      <p>{{ description }}</p>
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title: string
    description: string
    to: string
    icon?: Component
    disabled?: boolean
  }>(),
  {
    icon: undefined,
    disabled: false
  }
)
</script>
