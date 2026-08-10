<template>
  <el-card shadow="never" class="upload-panel">
    <template #header>
      <div class="panel-header"><strong>批量上传文件</strong><span>最多 20 个，单文件 20MB</span></div>
    </template>
    <el-form label-position="top">
      <el-form-item label="文件用途">
        <el-select v-model="assetType" class="full-width" :disabled="uploading">
          <el-option label="知识库来源" value="knowledge_source" />
          <el-option label="教学参考" value="teaching_reference" />
          <el-option label="临时引用" value="reference" />
        </el-select>
      </el-form-item>
    </el-form>
    <el-upload ref="uploadRef" drag multiple :auto-upload="false" :limit="20" :accept="accept" :disabled="uploading" :on-change="onChange" :on-remove="onRemove">
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div class="el-upload__text">拖拽多个文件到这里，或 <em>点击选择</em></div>
      <template #tip><div class="el-upload__tip">支持 PDF、Word、PowerPoint、Excel、CSV、TXT、Markdown。</div></template>
    </el-upload>
    <el-button class="full-width" type="primary" :loading="uploading" :disabled="!pendingFiles.length" @click="submit">上传 {{ pendingFiles.length }} 个文件</el-button>
    <el-progress v-if="uploading" :percentage="progress" />
    <div v-if="results.length" class="result-list" aria-live="polite">
      <div v-for="item in results" :key="`${item.original_name}-${item.file_id || 'failed'}`" class="result-row">
        <strong>{{ item.original_name }}</strong>
        <div class="result-statuses">
          <el-tag :type="item.success ? 'success' : 'danger'">{{ item.success ? '上传成功' : '上传失败' }}</el-tag>
          <el-tag v-if="item.success" :type="parseTagType(item.parse_status)">解析：{{ statusLabel(item.parse_status) }}</el-tag>
          <el-tag v-if="item.success && autoIngest" :type="ingestTagType(item.knowledge_ingest_status)">
            入库：{{ ingestStatusLabel(item.knowledge_ingest_status) }}
          </el-tag>
        </div>
        <small v-if="item.parse_error || item.error_message">{{ item.parse_error || item.error_message }}</small>
        <div v-if="item.file_id && (item.parse_status === 'failed' || item.knowledge_ingest_status === 'failed')" class="result-actions">
          <el-button
            v-if="item.parse_status === 'failed'"
            size="small"
            :loading="retryingIds.includes(Number(item.file_id))"
            @click="retryParse(item)"
          >重试解析</el-button>
          <el-button
            v-if="item.knowledge_ingest_status === 'failed' && item.knowledge_document_id"
            size="small"
            :loading="retryingIds.includes(Number(item.file_id))"
            @click="retryIngest(item)"
          >重试入库</el-button>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile, UploadFiles, UploadInstance, UploadRawFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { onBeforeUnmount, ref } from 'vue'

import { getFile, retryParseFile, uploadFilesBatch, type FileAsset, type FileBatchUploadItem, type FileParseStatus } from '@/api/files'
import { retryKnowledgeDocumentIngest } from '@/api/knowledge'
import { useFilesStore } from '@/stores/files'

const props = withDefaults(defineProps<{ autoIngest?: boolean; courseId?: number | null }>(), {
  autoIngest: false,
  courseId: null
})
const emit = defineEmits<{ uploaded: [file: FileAsset] }>()
const accept = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md'
const allowed = accept.split(',')
const uploadRef = ref<UploadInstance>()
const pendingFiles = ref<UploadRawFile[]>([])
type TrackedUploadItem = FileBatchUploadItem & {
  knowledge_ingest_status?: string | null
  parse_error?: string | null
}
const results = ref<TrackedUploadItem[]>([])
const assetType = ref('knowledge_source')
const uploading = ref(false)
const progress = ref(0)
const retryingIds = ref<number[]>([])
const filesStore = useFilesStore()
let disposed = false

function validate(file: UploadRawFile) {
  const validType = allowed.some((suffix) => file.name.toLowerCase().endsWith(suffix))
  if (!validType || file.size > 20 * 1024 * 1024) {
    ElMessage.error(`${file.name}：格式不支持或超过 20MB`)
    return false
  }
  return true
}
function onChange(_: UploadFile, files: UploadFiles) { pendingFiles.value = files.map((item) => item.raw).filter((file): file is UploadRawFile => Boolean(file && validate(file))) }
function onRemove(_: UploadFile, files: UploadFiles) { pendingFiles.value = files.map((item) => item.raw).filter((file): file is UploadRawFile => Boolean(file)) }
function statusLabel(status?: FileParseStatus | null) { return ({ pending: '等待解析', parsing: '解析中', parsed: '已解析', failed: '解析失败' } as Record<string, string>)[String(status)] || '上传成功' }
function ingestStatusLabel(status?: string | null) { return ({ parsing: '处理中', pending: '等待入库', ingesting: '入库中', ingested: '已入库', failed: '入库失败' } as Record<string, string>)[String(status)] || '等待入库' }
function parseTagType(status?: FileParseStatus | null) { return status === 'parsed' ? 'success' : status === 'failed' ? 'danger' : 'warning' }
function ingestTagType(status?: string | null) { return status === 'ingested' ? 'success' : status === 'failed' ? 'danger' : 'warning' }

function updateTracked(file: FileAsset) {
  results.value = results.value.map((item) => item.file_id === file.id ? {
    ...item,
    parse_status: file.parse_status,
    parse_error: file.parse_error,
    knowledge_document_id: file.knowledge_document_id || item.knowledge_document_id,
    knowledge_ingest_status: file.knowledge_ingest_status
  } : item)
  filesStore.addRecentFile(file)
  emit('uploaded', file)
}

async function watchFile(fileId: number) {
  const deadline = Date.now() + 30 * 60 * 1000
  while (!disposed && Date.now() < deadline) {
    try {
      const file = await getFile(fileId)
      updateTracked(file)
      const parseFinished = ['parsed', 'failed', 'deleted'].includes(file.parse_status)
      const ingestFinished = !props.autoIngest || ['ingested', 'failed'].includes(String(file.knowledge_ingest_status || ''))
      if (parseFinished && ingestFinished) return
    } catch (error) {
      results.value = results.value.map((item) => item.file_id === fileId ? {
        ...item,
        error_message: `状态刷新失败：${error instanceof Error ? error.message : '网络错误，将继续重试'}`
      } : item)
    }
    await new Promise((resolve) => window.setTimeout(resolve, 2000))
  }
}

async function submit() {
  if (uploading.value || !pendingFiles.value.length) return
  const form = new FormData()
  pendingFiles.value.forEach((file) => form.append('files', file))
  form.append('purpose', assetType.value)
  if (props.autoIngest) form.append('auto_ingest', 'true')
  if (props.courseId) form.append('course_id', String(props.courseId))
  uploading.value = true
  progress.value = 0
  try {
    const response = await uploadFilesBatch(form, (event) => { if (event.total) progress.value = Math.round(event.loaded / event.total * 100) })
    results.value = response.items.map((item) => ({
      ...item,
      knowledge_ingest_status: item.knowledge_document_id ? 'parsing' : null
    }))
    for (const item of response.items.filter((result) => result.success && result.file_id)) {
      const file = await getFile(Number(item.file_id))
      updateTracked(file)
      void watchFile(Number(item.file_id))
    }
    ElMessage[response.failed ? 'warning' : 'success'](`上传完成：成功 ${response.succeeded}，失败 ${response.failed}`)
    uploadRef.value?.clearFiles()
    pendingFiles.value = []
  } finally { uploading.value = false }
}

async function retryParse(item: TrackedUploadItem) {
  if (!item.file_id || retryingIds.value.includes(Number(item.file_id))) return
  const fileId = Number(item.file_id)
  retryingIds.value.push(fileId)
  try {
    updateTracked(await retryParseFile(fileId))
    void watchFile(fileId)
  } finally {
    retryingIds.value = retryingIds.value.filter((id) => id !== fileId)
  }
}

async function retryIngest(item: TrackedUploadItem) {
  if (!item.file_id || !item.knowledge_document_id || retryingIds.value.includes(Number(item.file_id))) return
  const fileId = Number(item.file_id)
  retryingIds.value.push(fileId)
  try {
    await retryKnowledgeDocumentIngest(Number(item.knowledge_document_id))
    results.value = results.value.map((result) => result.file_id === fileId ? { ...result, knowledge_ingest_status: 'parsing', error_message: null } : result)
    void watchFile(fileId)
  } finally {
    retryingIds.value = retryingIds.value.filter((id) => id !== fileId)
  }
}

onBeforeUnmount(() => { disposed = true })
</script>

<style scoped>
.full-width { width: 100%; }
.result-list { display: grid; gap: 8px; margin-top: 12px; }
.result-row { display: grid; gap: 7px; padding: 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.result-statuses { display: flex; flex-wrap: wrap; gap: 6px; }
.result-row small { grid-column: 1 / -1; color: var(--el-color-danger); }
.result-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
