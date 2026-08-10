<template>
  <article :class="['stat-card', `stat-card--${type}`]">
    <div class="stat-card__icon">
      <el-icon v-if="icon"><component :is="icon" /></el-icon>
    </div>
    <div>
      <span>{{ title }}</span>
      <strong>{{ value }}</strong>
      <p>{{ subtitle }}</p>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title: string
    value: string | number
    subtitle?: string
    icon?: Component
    type?: 'primary' | 'success' | 'warning' | 'info'
  }>(),
  {
    subtitle: '',
    icon: undefined,
    type: 'primary'
  }
)
</script>
