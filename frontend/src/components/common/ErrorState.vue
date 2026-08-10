<template>
  <div class="error-state">
    <el-result icon="warning" :title="title" :sub-title="description">
      <template v-if="$slots.actions || retryText" #extra>
        <slot name="actions">
          <el-button v-if="retryText" type="primary" @click="$emit('retry')">{{ retryText }}</el-button>
        </slot>
      </template>
    </el-result>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    retryText?: string
  }>(),
  {
    title: '加载失败',
    description: '请稍后重试，或检查当前账号权限和网络状态。',
    retryText: ''
  }
)

defineEmits<{
  retry: []
}>()
</script>
