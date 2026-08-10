<template>
  <section class="page-header">
    <div class="page-header__copy">
      <div class="page-header__eyebrow">
        <el-icon v-if="icon"><component :is="icon" /></el-icon>
        <span>{{ eyebrow }}</span>
      </div>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title: string
    description: string
    eyebrow?: string
    icon?: Component
  }>(),
  {
    eyebrow: '工作台',
    icon: undefined
  }
)
</script>
