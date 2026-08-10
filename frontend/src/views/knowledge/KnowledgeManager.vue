<template>
  <section class="page-stack">
    <div class="page-hero">
      <div>
        <span>Knowledge Base</span>
        <h1>知识库管理</h1>
        <p>从上传文件创建知识库文档，同步或异步入库到 Chroma，并在生成前测试检索效果。</p>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :xs="24" :lg="9">
        <FileUploadPanel @uploaded="handleUploaded" />
        <el-card shadow="never" class="knowledge-create-card">
          <template #header>
            <div class="panel-header">
              <strong>创建文档</strong>
              <span>来自已上传文件</span>
            </div>
          </template>
          <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
            <el-form-item label="选择已上传文件" prop="file_id">
              <el-select
                v-model="form.file_id"
                class="full-width"
                clearable
                filterable
                placeholder="上传后自动选中文件"
              >
                <el-option
                  v-for="file in filesStore.recentFiles"
                  :key="file.id"
                  :label="file.original_filename"
                  :value="file.id"
                >
                  <div class="entity-option">
                    <strong>{{ file.original_filename }}</strong>
                    <span>{{ file.content_type || file.asset_type }} · {{ formatDateTime(file.created_at) }}</span>
                  </div>
                </el-option>
              </el-select>
              <div v-if="!filesStore.recentFiles.length" class="entity-empty">
                请先在上方上传文件，系统会自动选中文件用于创建知识库文档。
              </div>
            </el-form-item>
            <el-form-item label="标题" prop="title">
              <el-input v-model="form.title" placeholder="课程资料标题" />
            </el-form-item>
            <el-form-item label="课程关联">
              <el-alert
                type="info"
                :closable="false"
                title="使用系统默认课程上下文，无需填写课程编号。"
              />
            </el-form-item>
            <el-form-item label="来源类型">
              <el-input v-model="form.source_type" />
            </el-form-item>
            <el-button type="primary" class="full-width" :loading="creating" @click="createDocument">创建知识库文档</el-button>
          </el-form>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="15">
        <KnowledgeDocumentTable
          :documents="knowledge.documents"
          :loading="knowledge.loading"
          :ingesting-ids="knowledge.ingestingIds"
          @select="selectDocument"
          @ingest="ingestDocument"
          @ingest-async="ingestDocumentAsync"
          @delete="confirmDeleteDocument"
        />
        <TaskPollingPanel v-if="asyncTaskId" class="knowledge-section" :task-id="asyncTaskId" />
        <KnowledgeRetrieveTester class="knowledge-section" :documents="knowledge.documents" />
      </el-col>
    </el-row>
  </section>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import { createKnowledgeDocument, type KnowledgeDocument } from '@/api/knowledge'
import KnowledgeDocumentTable from '@/components/knowledge/KnowledgeDocumentTable.vue'
import KnowledgeRetrieveTester from '@/components/knowledge/KnowledgeRetrieveTester.vue'
import TaskPollingPanel from '@/components/tasks/TaskPollingPanel.vue'
import FileUploadPanel from '@/components/upload/FileUploadPanel.vue'
import { useFilesStore } from '@/stores/files'
import { useKnowledgeStore } from '@/stores/knowledge'
import { formatDateTime } from '@/utils/format'

const knowledge = useKnowledgeStore()
const filesStore = useFilesStore()
const formRef = ref<FormInstance>()
const creating = ref(false)
const asyncTaskId = ref<number | null>(null)
const form = reactive({
  file_id: null as number | null,
  title: '',
  course_id: null as number | null,
  source_type: 'upload'
})

const rules: FormRules = {
  file_id: [{ required: true, type: 'number', message: '请先上传并选择文件。', trigger: 'change' }],
  title: [{ required: true, min: 1, message: '请填写文档标题。', trigger: 'blur' }]
}

function handleUploaded(file: { id: number; original_filename: string }) {
  form.file_id = file.id
  if (!form.title) form.title = file.original_filename.replace(/\.[^.]+$/, '')
}

async function createDocument() {
  await formRef.value?.validate()
  creating.value = true
  try {
    const document = await createKnowledgeDocument({
      file_id: Number(form.file_id),
      title: form.title,
      course_id: form.course_id || null,
      source_type: form.source_type || 'upload'
    })
    knowledge.upsertDocument(document)
    ElMessage.success(`知识库文档“${document.title}”已创建`)
  } finally {
    creating.value = false
  }
}

function selectDocument(document: KnowledgeDocument) {
  ElMessage.info(`已选择文档：${document.title}`)
}

async function ingestDocument(document: KnowledgeDocument) {
  await knowledge.ingestDocument(document.id)
  ElMessage.success('文档已完成入库')
}

async function ingestDocumentAsync(document: KnowledgeDocument) {
  const task = await knowledge.ingestDocumentAsync(document.id)
  asyncTaskId.value = task.task_id
  ElMessage.success('异步入库任务已提交，可在任务中心查看进度。')
}

async function confirmDeleteDocument(document: KnowledgeDocument) {
  await ElMessageBox.confirm(`确认删除知识库文档 ${document.title}？`, '删除文档', { type: 'warning' })
  await knowledge.deleteDocument(document.id)
  ElMessage.success('知识库文档已删除')
}

onMounted(() => {
  knowledge.fetchDocuments()
  filesStore.fetchFiles()
})
</script>

<style scoped>
.entity-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.entity-option span,
.entity-empty {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.entity-empty {
  margin-top: 8px;
}
</style>
