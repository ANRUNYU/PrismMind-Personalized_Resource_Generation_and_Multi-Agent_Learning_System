<template>
  <el-tag class="status-tag" :type="tagType" effect="light" round>
    {{ label }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status?: string | boolean | null
    truthyLabel?: string
    falsyLabel?: string
  }>(),
  {
    status: null,
    truthyLabel: '启用',
    falsyLabel: '禁用'
  }
)

const normalized = computed(() => {
  if (typeof props.status === 'boolean') return props.status ? 'active' : 'inactive'
  return String(props.status || 'unknown').toLowerCase()
})

const labelMap: Record<string, string> = {
  active: props.truthyLabel,
  inactive: props.falsyLabel,
  enabled: '启用',
  disabled: '禁用',
  pending: '等待中',
  running: '运行中',
  success: '成功',
  succeeded: '已成功',
  failed: '失败',
  cancelled: '已取消',
  created: '已创建',
  ingested: '已入库',
  ingesting: '入库中',
  parsed: '已解析',
  parsing: '解析中',
  not_parsed: '未解析',
  submitted: '已提交',
  graded: '已批改',
  not_started: '未开始',
  draft: '草稿',
  published: '已发布',
  generated: '已生成',
  in_progress: '进行中',
  completed: '已完成',
  closed: '已关闭',
  archived: '已归档',
  viewed: '已查看',
  unviewed: '未查看',
  open: '未完成',
  unknown: '未知'
}

const typeMap: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'primary'> = {
  active: 'success',
  enabled: 'success',
  success: 'success',
  succeeded: 'success',
  completed: 'success',
  ingested: 'success',
  parsed: 'success',
  parsing: 'primary',
  submitted: 'success',
  graded: 'success',
  published: 'success',
  generated: 'success',
  inactive: 'danger',
  disabled: 'danger',
  failed: 'danger',
  pending: 'warning',
  draft: 'warning',
  running: 'primary',
  ingesting: 'primary',
  in_progress: 'primary',
  open: 'info',
  archived: 'info',
  closed: 'info',
  not_started: 'info',
  cancelled: 'info',
  not_parsed: 'info',
  created: 'info',
  viewed: 'primary',
  unviewed: 'info',
  unknown: 'info'
}

const label = computed(() => labelMap[normalized.value] || String(props.status || '-'))
const tagType = computed(() => typeMap[normalized.value] || 'info')
</script>
