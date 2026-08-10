<template>
  <div class="course-knowledge-tab">
    <div class="knowledge-grid">
      <section class="knowledge-panel">
        <div class="panel-title">
          <div>
            <strong>课程资料上传</strong>
            <span>支持 txt、md、pdf、docx，上传后可创建课程知识库文档。</span>
          </div>
          <el-button :icon="Refresh" :loading="loadingFiles" @click="loadFiles">刷新文件</el-button>
        </div>

        <el-upload
          ref="uploadRef"
          drag
          multiple
          :auto-upload="false"
          :limit="20"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md"
          :disabled="uploading"
          :on-change="handleFileChange"
          :on-remove="handleFileRemove"
        >
          <el-icon><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽文件到此处，或点击选择课程资料</div>
          <template #tip>
            <div class="el-upload__tip">文件会上传到真实文件中心，并用于当前课程知识库。</div>
          </template>
        </el-upload>
        <el-button class="full-width" type="primary" :loading="uploading" @click="submitUpload">上传课程资料</el-button>

        <el-divider />

        <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
          <el-form-item label="选择已上传文件" prop="file_id">
            <el-select
              v-model="createForm.file_id"
              class="full-width"
              filterable
              clearable
              :loading="loadingFiles"
              placeholder="按文件名选择即可"
              @change="syncTitleFromSelectedFile"
            >
              <el-option v-for="file in files" :key="file.id" :label="file.original_filename" :value="file.id">
                <div class="file-option">
                  <strong>{{ file.original_filename }}</strong>
                  <span>{{ formatFileSize(file.file_size) }} · {{ formatDateTime(file.created_at) }}</span>
                </div>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="文档标题" prop="title">
            <el-input v-model="createForm.title" maxlength="255" placeholder="例如：FastAPI 路由与依赖注入讲义" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input
              v-model="createForm.description"
              type="textarea"
              :rows="2"
              maxlength="1000"
              placeholder="可选，用于记录这份资料的使用场景"
            />
          </el-form-item>
          <el-button class="full-width" type="success" :loading="creating" @click="createDocument">
            创建课程知识库文档
          </el-button>
        </el-form>
      </section>

      <section class="knowledge-panel">
        <div class="panel-title">
          <div>
            <strong>课程知识库文档</strong>
            <span>{{ documentTotal }} 个文档，学生只读可见。</span>
          </div>
          <el-button :icon="Refresh" :loading="loadingDocuments" @click="loadDocuments">刷新文档</el-button>
        </div>

        <EmptyState
          v-if="!loadingDocuments && !documents.length"
          title="暂无课程知识库资料"
          description="请上传教案、课件或参考资料，并创建课程知识库文档。"
        />
        <el-table v-else v-loading="loadingDocuments" :data="documents" row-key="id" class="knowledge-table">
          <el-table-column prop="title" label="文档标题" min-width="190" show-overflow-tooltip />
          <el-table-column prop="filename" label="文件名" min-width="190" show-overflow-tooltip />
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <StatusTag :status="row.status" />
            </template>
          </el-table-column>
          <el-table-column prop="chunk_count" label="切片" width="80" />
          <el-table-column label="更新时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="290" fixed="right">
            <template #default="{ row }">
              <el-button text type="success" :loading="isBusy(row.id)" @click="ingestDocument(row)">同步入库</el-button>
              <el-button text type="primary" :loading="isBusy(row.id)" @click="ingestDocumentAsync(row)">异步入库</el-button>
              <el-button text type="danger" @click="confirmDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="table-pagination">
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.page_size"
            background
            layout="total, prev, pager, next"
            :total="documentTotal"
            @current-change="loadDocuments"
          />
        </div>
        <TaskPollingPanel
          v-if="asyncTaskId"
          class="task-panel"
          :task-id="asyncTaskId"
          @completed="handleIngestCompleted"
          @failed="handleIngestFailed"
        />
      </section>
    </div>

    <section class="knowledge-panel">
      <div class="panel-title">
        <div>
          <strong>课程内检索测试</strong>
          <span>检索范围自动限制在当前课程知识库。</span>
        </div>
      </div>
      <el-form class="retrieve-form" label-position="top" @submit.prevent="retrieveDocuments">
        <el-form-item label="检索问题">
          <el-input v-model="retrieveForm.query" type="textarea" :rows="3" placeholder="例如：FastAPI 如何处理请求参数校验？" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :xs="24" :md="16">
            <el-form-item label="限定文档（可选）">
              <el-select
                v-model="retrieveForm.document_ids"
                class="full-width"
                multiple
                clearable
                filterable
                collapse-tags
                placeholder="按文档标题选择即可"
              >
                <el-option v-for="document in documents" :key="document.id" :label="document.title" :value="document.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="引用数量">
              <el-input-number v-model="retrieveForm.top_k" :min="1" :max="10" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-button type="primary" :loading="retrieving" @click="retrieveDocuments">开始检索</el-button>
      </el-form>

      <div class="retrieve-results">
        <EmptyState
          v-if="hasRetrieved && !retrieveResults.length"
          title="暂无匹配结果"
          description="可以换一个问题，或先对课程资料执行入库。"
        />
        <article v-for="(result, index) in retrieveResults" :key="`${result.document_id || 'doc'}-${index}`" class="result-card">
          <div class="result-meta">
            <strong>{{ result.title || result.filename || `结果 ${index + 1}` }}</strong>
            <el-tag v-if="result.filename" size="small" type="info">{{ result.filename }}</el-tag>
            <el-tag v-if="result.score !== null && result.score !== undefined" size="small">
              相似度 {{ Number(result.score).toFixed(4) }}
            </el-tag>
          </div>
          <p>{{ result.content }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Refresh, UploadFilled } from '@element-plus/icons-vue'
import type { FormInstance, FormRules, UploadFile, UploadInstance, UploadRawFile } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import { uploadFilesBatch } from '@/api/files'

import {
  createCourseKnowledgeDocument,
  deleteCourseKnowledgeDocument,
  ingestCourseKnowledgeDocument,
  ingestCourseKnowledgeDocumentAsync,
  listCourseFiles,
  listCourseKnowledgeDocuments,
  retrieveCourseKnowledge
} from '@/api/courseKnowledge'
import EmptyState from '@/components/common/EmptyState.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TaskPollingPanel from '@/components/tasks/TaskPollingPanel.vue'
import type { CourseFile, CourseKnowledgeDocument, CourseKnowledgeRetrieveResult } from '@/types/courseKnowledge'
import { formatDateTime, formatFileSize } from '@/utils/format'

const props = defineProps<{
  courseId: string | number
}>()

const uploadRef = ref<UploadInstance>()
const createFormRef = ref<FormInstance>()
const uploadFileRaws = ref<UploadRawFile[]>([])
const files = ref<CourseFile[]>([])
const documents = ref<CourseKnowledgeDocument[]>([])
const retrieveResults = ref<CourseKnowledgeRetrieveResult[]>([])
const documentTotal = ref(0)
const loadingFiles = ref(false)
const loadingDocuments = ref(false)
const uploading = ref(false)
const creating = ref(false)
const retrieving = ref(false)
const hasRetrieved = ref(false)
const busyDocumentIds = ref<number[]>([])
const asyncTaskId = ref<number | null>(null)
const asyncDocumentId = ref<number | null>(null)
const autoQueuedDocumentIds = ref<number[]>([])
const pagination = reactive({ page: 1, page_size: 20 })
const createForm = reactive({
  file_id: null as number | null,
  title: '',
  description: ''
})
const retrieveForm = reactive({
  query: '',
  top_k: 5,
  document_ids: [] as number[]
})

const createRules: FormRules = {
  file_id: [{ required: true, type: 'number', message: '请先按文件名选择已上传资料。', trigger: 'change' }],
  title: [{ required: true, min: 1, message: '请填写文档标题。', trigger: 'blur' }]
}

function handleFileChange(_uploadFile: UploadFile, uploadFiles: UploadFile[]) {
  uploadFileRaws.value = uploadFiles.map((item) => item.raw).filter((item): item is UploadRawFile => Boolean(item))
}

function handleFileRemove(_uploadFile: UploadFile, uploadFiles: UploadFile[]) {
  uploadFileRaws.value = uploadFiles.map((item) => item.raw).filter((item): item is UploadRawFile => Boolean(item))
}

function fileTitle(filename: string) {
  return filename.replace(/\.[^.]+$/, '')
}

function syncTitleFromSelectedFile() {
  const selected = files.value.find((file) => file.id === createForm.file_id)
  if (selected && !createForm.title) {
    createForm.title = fileTitle(selected.original_filename)
  }
}

async function loadFiles() {
  loadingFiles.value = true
  try {
    const data = await listCourseFiles(props.courseId, { page: 1, page_size: 100 })
    files.value = data.items
  } finally {
    loadingFiles.value = false
  }
}

async function loadDocuments() {
  loadingDocuments.value = true
  try {
    const data = await listCourseKnowledgeDocuments(props.courseId, pagination)
    documents.value = data.items
    documentTotal.value = data.total
    const legacyPending = data.items.filter(
      (document) => document.status === 'pending' && !autoQueuedDocumentIds.value.includes(document.id)
    )
    let recoveredCount = 0
    for (const document of legacyPending) {
      autoQueuedDocumentIds.value.push(document.id)
      try {
        const task = await ingestCourseKnowledgeDocumentAsync(props.courseId, document.id)
        asyncTaskId.value = task.task_id
        asyncDocumentId.value = document.id
        recoveredCount += 1
      } catch {
        autoQueuedDocumentIds.value = autoQueuedDocumentIds.value.filter((id) => id !== document.id)
      }
    }
    if (recoveredCount) {
      ElMessage.info(`已自动恢复 ${recoveredCount} 份历史等待文档的入库任务。`)
    }
  } finally {
    loadingDocuments.value = false
  }
}

async function submitUpload() {
  if (!uploadFileRaws.value.length) {
    ElMessage.warning('请先选择要上传的课程资料。')
    return
  }
  uploading.value = true
  try {
    const formData = new FormData()
    uploadFileRaws.value.forEach((file) => formData.append('files', file))
    formData.append('purpose', 'course_material')
    formData.append('course_id', String(props.courseId))
    formData.append('auto_ingest', 'false')
    const result = await uploadFilesBatch(formData)
    uploadRef.value?.clearFiles()
    uploadFileRaws.value = []
    ElMessage[result.failed ? 'warning' : 'success'](`课程资料上传完成：成功 ${result.succeeded}，失败 ${result.failed}。请选择文件创建知识库文档。`)
    await loadAll()
  } finally {
    uploading.value = false
  }
}

async function createDocument() {
  await createFormRef.value?.validate()
  creating.value = true
  try {
    const document = await createCourseKnowledgeDocument(props.courseId, {
      file_id: Number(createForm.file_id),
      title: createForm.title.trim(),
      description: createForm.description.trim() || null
    })
    documents.value = [document, ...documents.value.filter((item) => item.id !== document.id)]
    documentTotal.value = Math.max(documentTotal.value, documents.value.length)
    asyncTaskId.value = document.ingest_task_id || null
    asyncDocumentId.value = document.ingest_task_id ? document.id : null
    ElMessage.success(`课程知识库文档「${document.title}」已创建并开始自动入库。`)
    createForm.file_id = null
    createForm.title = ''
    createForm.description = ''
    await loadDocuments()
  } finally {
    creating.value = false
  }
}

function setDocumentBusy(documentId: number, busy: boolean) {
  if (busy) {
    busyDocumentIds.value = Array.from(new Set([...busyDocumentIds.value, documentId]))
    return
  }
  busyDocumentIds.value = busyDocumentIds.value.filter((id) => id !== documentId)
}

function isBusy(documentId: number) {
  return busyDocumentIds.value.includes(documentId)
}

async function ingestDocument(document: CourseKnowledgeDocument) {
  setDocumentBusy(document.id, true)
  try {
    const result = await ingestCourseKnowledgeDocument(props.courseId, document.id)
    ElMessage.success(`同步入库完成，切片数：${result.chunk_count}`)
    await loadDocuments()
  } finally {
    setDocumentBusy(document.id, false)
  }
}

async function ingestDocumentAsync(document: CourseKnowledgeDocument) {
  setDocumentBusy(document.id, true)
  try {
    const task = await ingestCourseKnowledgeDocumentAsync(props.courseId, document.id)
    asyncTaskId.value = task.task_id
    asyncDocumentId.value = document.id
    ElMessage.success('异步入库任务已提交，可在任务中心查看进度。')
    await loadDocuments()
  } finally {
    setDocumentBusy(document.id, false)
  }
}

async function handleIngestCompleted() {
  ElMessage.success('课程知识库文档已入库，可用于出题。')
  await loadDocuments()
  asyncTaskId.value = null
  asyncDocumentId.value = null
}

async function handleIngestFailed() {
  await loadDocuments()
  const document = documents.value.find((item) => item.id === asyncDocumentId.value)
  if (document?.status === 'ingested' && document.chunk_count > 0) {
    ElMessage.success(`课程知识库文档已实际入库（${document.chunk_count} 个切片），已忽略过期任务错误。`)
  } else {
    ElMessage.error('课程知识库入库失败，请查看任务错误后重试。')
  }
  asyncTaskId.value = null
  asyncDocumentId.value = null
}

async function confirmDelete(document: CourseKnowledgeDocument) {
  try {
    await ElMessageBox.confirm(`确认删除课程知识库文档「${document.title}」？物理文件不会被删除。`, '删除文档', {
      type: 'warning'
    })
  } catch {
    return
  }
  await deleteCourseKnowledgeDocument(props.courseId, document.id)
  documents.value = documents.value.filter((item) => item.id !== document.id)
  documentTotal.value = Math.max(0, documentTotal.value - 1)
  ElMessage.success('课程知识库文档已删除，原始文件仍保留。')
}

async function retrieveDocuments() {
  if (!retrieveForm.query.trim()) {
    ElMessage.warning('请输入课程知识库检索问题。')
    return
  }
  retrieving.value = true
  hasRetrieved.value = true
  try {
    const data = await retrieveCourseKnowledge(props.courseId, {
      query: retrieveForm.query.trim(),
      top_k: retrieveForm.top_k,
      document_ids: retrieveForm.document_ids.length ? retrieveForm.document_ids : null
    })
    retrieveResults.value = data.results
  } finally {
    retrieving.value = false
  }
}

async function loadAll() {
  await Promise.all([loadFiles(), loadDocuments()])
}

onMounted(loadAll)
</script>

<style scoped>
.course-knowledge-tab,
.knowledge-grid,
.knowledge-panel,
.retrieve-results {
  display: grid;
  gap: 16px;
}

.knowledge-grid {
  grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.4fr);
}

.knowledge-panel {
  align-content: start;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px;
  background: var(--el-bg-color);
}

.panel-title,
.result-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-title > div {
  display: grid;
  gap: 4px;
}

.panel-title span,
.file-option span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.file-option {
  display: grid;
  gap: 2px;
  line-height: 1.35;
}

.full-width {
  width: 100%;
}

.knowledge-table {
  width: 100%;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
}

.task-panel {
  margin-top: 8px;
}

.retrieve-form {
  max-width: 920px;
}

.result-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  background: var(--el-fill-color-extra-light);
}

.result-card p {
  margin: 0;
  color: var(--el-text-color-regular);
  line-height: 1.7;
  white-space: pre-wrap;
}

@media (max-width: 960px) {
  .knowledge-grid {
    grid-template-columns: 1fr;
  }
}
</style>
