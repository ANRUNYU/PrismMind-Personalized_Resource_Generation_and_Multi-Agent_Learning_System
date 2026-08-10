<template>
  <div class="loading-state" :style="{ minHeight }" data-testid="external-loading">
    <div class="loading-state__prism" aria-hidden="true" />
    <p>{{ message }}</p>
    <el-skeleton v-if="rows > 0" :rows="rows" animated />
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    rows?: number
    minHeight?: string
    message?: string
  }>(),
  {
    rows: 5,
    minHeight: '220px',
    message: '正在加载'
  }
)
</script>

<style scoped>
.loading-state {
  display: grid;
  place-items: center;
  gap: 14px;
  padding: 24px;
  border: 1px dashed rgba(93, 111, 180, 0.28);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(14, 165, 233, 0.05)),
    var(--el-bg-color);
}

.loading-state__prism {
  width: 54px;
  height: 54px;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(79, 70, 229, 0.22), rgba(37, 99, 235, 0.16)),
    conic-gradient(from 90deg, #60a5fa, #8b5cf6, #22d3ee, #60a5fa);
  clip-path: polygon(50% 0, 100% 38%, 78% 100%, 18% 82%, 0 24%);
  animation: loading-prism-spin 1.8s linear infinite;
}

.loading-state p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-weight: 700;
}

@keyframes loading-prism-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
