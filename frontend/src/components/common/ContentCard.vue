<template>
  <el-card shadow="never" class="content-card">
    <template v-if="title || subtitle || $slots.actions" #header>
      <div class="content-card__header">
        <div>
          <strong v-if="title">{{ title }}</strong>
          <span v-if="subtitle">{{ subtitle }}</span>
        </div>
        <div v-if="$slots.actions" class="content-card__actions">
          <slot name="actions" />
        </div>
      </div>
    </template>
    <slot />
  </el-card>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>
