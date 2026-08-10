<template>
  <div class="task-polling-panel">
    <el-skeleton v-if="loading && !task" :rows="3" animated />
    <TaskProgressCard v-else-if="task" :task="task" :warnings="warnings" :references="references" :stream-error="error" :using-polling="usingPolling" @retry="restart" />
    <el-alert v-else type="info" title="任务已提交，正在等待首次状态更新。" :closable="false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

import TaskProgressCard from '@/components/tasks/TaskProgressCard.vue'
import { useTaskStream } from '@/composables/useTaskStream'
import type { TaskDetail } from '@/types/task'

const props = withDefaults(defineProps<{ taskId?: number | null; intervalMs?: number }>(), { intervalMs: 2500 })
const emit = defineEmits<{ update: [task: TaskDetail]; completed: [task: TaskDetail]; failed: [task: TaskDetail] }>()
const { task, warnings, references, usingPolling, error, start } = useTaskStream(3, props.intervalMs)
const loading = computed(() => Boolean(props.taskId) && !task.value)
let terminalTaskId: number | null = null

async function restart() { if (props.taskId) await start(props.taskId) }
watch(() => props.taskId, restart)
watch(task, (value) => {
  if (!value) return
  emit('update', value)
  if (terminalTaskId === value.id) return
  if (value.status === 'success') { terminalTaskId = value.id; emit('completed', value) }
  if (value.status === 'failed') { terminalTaskId = value.id; emit('failed', value) }
}, { deep: true })
onMounted(restart)
</script>
