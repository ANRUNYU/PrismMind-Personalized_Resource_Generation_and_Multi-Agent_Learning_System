<template>
  <el-card shadow="never" class="task-progress-card">
    <div class="task-progress-card__head">
      <div><span>{{ formatTaskType(task.task_type) }}</span><strong>{{ stageLabel }}</strong></div>
      <TaskStatusTag :status="task.status" />
    </div>
    <el-progress :percentage="normalizedProgress" :status="progressStatus" />
    <p v-if="task.status_message" class="stage-message">{{ task.status_message }}</p>
    <el-tag v-if="usingPolling" type="warning" size="small">实时连接不可用，正在轮询</el-tag>
    <div v-if="task.partial_content" class="partial-content"><strong>已生成内容</strong><pre>{{ task.partial_content }}</pre></div>
    <el-alert v-for="warning in warnings" :key="warning" type="warning" :title="warning" :closable="false" show-icon />
    <el-alert v-if="streamError" type="warning" :title="streamError" :closable="false" />
    <el-alert v-if="task.error_message" type="error" :title="task.error_message" :closable="false" show-icon />
    <el-alert v-if="isEvidenceInsufficient" type="warning" :closable="false" show-icon
      title="当前课程知识库中未找到足够证据。请上传相关教材、课件或教师资料后重试。" />
    <CitationPanel :citations="citationItems" />
    <details v-if="isDevelopment && diagnostics" class="diagnostics">
      <summary>开发诊断</summary>
      <dl>
        <template v-for="(value, key) in diagnostics" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></template>
      </dl>
    </details>
    <div class="task-progress-card__meta">
      <span>创建 {{ formatDateTime(task.created_at) }}</span>
      <span v-if="task.started_at">开始 {{ formatDateTime(task.started_at) }}</span>
      <span v-if="task.finished_at">结束 {{ formatDateTime(task.finished_at) }}</span>
    </div>
    <el-button v-if="task.status === 'failed'" type="warning" plain @click="$emit('retry')">重试连接</el-button>
    <el-button v-if="task.result_artifact_id" text type="primary" @click="$router.push(`/teacher/artifacts/${task.result_artifact_id}`)">打开生成产物</el-button>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TaskStatusTag from '@/components/tasks/TaskStatusTag.vue'
import CitationPanel from '@/components/common/CitationPanel.vue'
import type { CitationItem, TaskItem } from '@/types/task'
import { formatDateTime, formatTaskType } from '@/utils/format'

const props = withDefaults(defineProps<{ task: TaskItem; warnings?: string[]; references?: Record<string, unknown>[]; streamError?: string | null; usingPolling?: boolean }>(), { warnings: () => [], references: () => [], streamError: null, usingPolling: false })
defineEmits<{ retry: [] }>()
const stageLabels: Record<string, string> = { queued: '等待执行', validating: '校验输入', parsing_references: '解析参考资料', retrieving: '检索知识库', building_prompt: '构建提示词', generating: '生成内容', quality_analysis: '质量分析', persisting: '保存结果', completed: '已完成' }
const stageLabel = computed(() => stageLabels[props.task.current_stage || 'queued'] || props.task.current_stage || '异步任务')
const normalizedProgress = computed(() => Math.max(0, Math.min(100, Number(props.task.progress || 0))))
const progressStatus = computed(() => props.task.status === 'success' ? 'success' : props.task.status === 'failed' ? 'exception' : undefined)
const citationItems = computed(() => props.references.filter(item => item.citation_id && item.source_filename) as unknown as CitationItem[])
const isEvidenceInsufficient = computed(() => props.task.result_payload?.evidence_status === 'evidence_insufficient')
const isDevelopment = import.meta.env.DEV
const diagnostics = computed(() => props.task.result_payload?.diagnostics as Record<string, unknown> | undefined)
</script>

<style scoped>
.task-progress-card__head,.task-progress-card__meta{display:flex;justify-content:space-between;gap:12px}.task-progress-card__head>div{display:grid}.stage-message{color:var(--el-text-color-secondary)}.partial-content{margin:12px 0}.partial-content pre{max-height:280px;overflow:auto;white-space:pre-wrap;background:var(--el-fill-color-light);padding:12px;border-radius:6px}.task-progress-card__meta{margin:10px 0;color:var(--el-text-color-secondary);font-size:12px;flex-wrap:wrap}
.diagnostics{margin-top:12px}.diagnostics dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}.diagnostics dt{font-weight:600}.diagnostics dd{margin:0;overflow-wrap:anywhere}
</style>
