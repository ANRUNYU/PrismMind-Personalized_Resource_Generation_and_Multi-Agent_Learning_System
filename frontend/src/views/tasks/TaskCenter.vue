<template>
  <section class="task-center-page">
    <PageHeader
      eyebrow="异步任务"
      title="任务中心"
      description="跟踪教师生成、知识库入库和学生资源生成等 Celery 异步任务进度。"
      :icon="Operation"
    >
      <template #actions>
        <el-tag v-if="activeTaskCount" type="primary" effect="light">{{ activeTaskCount }} 个任务轮询中</el-tag>
        <el-button :loading="tasks.loading" @click="loadTasks">刷新任务</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never" class="table-card">
      <template #header>
        <div class="panel-header">
          <strong>我的任务</strong>
          <span>{{ tasks.total }} 条记录</span>
        </div>
      </template>
      <div class="table-toolbar task-toolbar">
        <el-select v-model="filters.status" clearable placeholder="任务状态">
          <el-option label="等待中" value="pending" />
          <el-option label="运行中" value="running" />
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failed" />
        </el-select>
        <el-select v-model="filters.task_type" clearable filterable placeholder="任务类型">
          <el-option v-for="item in taskTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="loadTasks">应用筛选</el-button>
      </div>

      <EmptyState v-if="!tasks.loading && !tasks.tasks.length" title="暂无任务" description="提交异步生成或知识库入库后，任务会出现在这里。" />
      <el-table v-else v-loading="tasks.loading" :data="tasks.tasks">
        <el-table-column label="类型" min-width="220">
          <template #default="{ row }">{{ formatTaskType(row.task_type) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }"><TaskStatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="进度" min-width="180">
          <template #default="{ row }">
            <el-progress :percentage="Math.max(0, Math.min(100, Number(row.progress || 0)))" />
          </template>
        </el-table-column>
        <el-table-column label="结果" width="120">
          <template #default="{ row }">
            <el-button v-if="row.result_artifact_id" text type="primary" @click="$router.push(`/teacher/artifacts/${row.result_artifact_id}`)">
              查看产物
            </el-button>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openTask(row.id)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.page_size"
          layout="total, sizes, prev, pager, next"
          :total="tasks.total"
          @current-change="loadTasks"
          @size-change="loadTasks"
        />
      </div>
    </el-card>

    <el-drawer v-model="drawerVisible" title="任务详情" size="44%">
      <el-skeleton v-if="tasks.detailLoading" :rows="4" animated />
      <TaskProgressCard v-else-if="tasks.currentTask" :task="tasks.currentTask" />
      <el-card v-if="tasks.currentTask?.input_payload" shadow="never" class="task-input-card">
        <template #header><strong>输入摘要</strong></template>
        <pre>{{ inputPayloadPreview }}</pre>
      </el-card>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { Operation } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import TaskProgressCard from '@/components/tasks/TaskProgressCard.vue'
import TaskStatusTag from '@/components/tasks/TaskStatusTag.vue'
import { useTasksStore } from '@/stores/tasks'
import type { TaskStatus, TaskType } from '@/types/task'
import { formatDateTime, formatTaskType, taskTypeText } from '@/utils/format'

const tasks = useTasksStore()
const drawerVisible = ref(false)
const pagination = reactive({ page: 1, page_size: 10 })
const filters = reactive({
  status: '' as TaskStatus | '',
  task_type: '' as TaskType | ''
})
const taskTypeOptions = Object.entries(taskTypeText).map(([value, label]) => ({ value, label }))
const inputPayloadPreview = computed(() => {
  if (!tasks.currentTask?.input_payload) return ''
  const text = JSON.stringify(tasks.currentTask.input_payload, null, 2)
  return text.length > 2400 ? `${text.slice(0, 2400)}\n... truncated in UI` : text
})
const activeTaskCount = computed(() => tasks.tasks.filter((task) => task.status === 'pending' || task.status === 'running').length)
let refreshTimer: number | undefined

async function loadTasks() {
  await tasks.fetchTasks({
    page: pagination.page,
    page_size: pagination.page_size,
    status: filters.status || undefined,
    task_type: filters.task_type || undefined
  })
}

function startAutoRefresh() {
  stopAutoRefresh()
  refreshTimer = window.setInterval(() => {
    if (activeTaskCount.value > 0 && !tasks.loading) {
      loadTasks()
    }
  }, 8000)
}

function stopAutoRefresh() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = undefined
  }
}

async function openTask(taskId: number) {
  drawerVisible.value = true
  await tasks.fetchTask(taskId)
}

onMounted(async () => {
  await loadTasks()
  startAutoRefresh()
})
onBeforeUnmount(stopAutoRefresh)
</script>
