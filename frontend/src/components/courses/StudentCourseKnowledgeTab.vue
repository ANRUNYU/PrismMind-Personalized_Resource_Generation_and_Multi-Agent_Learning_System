<template>
  <div class="student-course-knowledge-tab">
    <section class="knowledge-panel">
      <div class="panel-title">
        <div>
          <strong>教师课程知识库</strong>
          <span>以下资料由教师上传并入库，学生可只读检索。</span>
        </div>
        <el-button :icon="Refresh" :loading="loading" @click="loadDocuments">刷新</el-button>
      </div>

      <EmptyState
        v-if="!loading && !documents.length"
        title="教师暂未上传课程资料"
        description="课程知识库建立后，你可以在这里按问题检索教师资料。"
      />
      <el-table v-else v-loading="loading" :data="documents" row-key="id" class="knowledge-table">
        <el-table-column prop="title" label="文档标题" min-width="190" show-overflow-tooltip />
        <el-table-column prop="filename" label="文件名" min-width="190" show-overflow-tooltip />
        <el-table-column prop="owner_name" label="来源教师" width="140" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <StatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :disabled="!row.file_id"
              :loading="downloadingId === row.id"
              @click="downloadCourseDocument(row)"
            >
              下载
            </el-button>
            <el-tag v-if="row.added_to_personal && row.personal_document_status === 'ingested'" type="success">
              已入库
            </el-tag>
            <el-tag v-else-if="row.added_to_personal" type="warning">
              入库中
            </el-tag>
            <el-button
              v-else
              link
              type="success"
              :disabled="row.status !== 'ingested'"
              :loading="copyingId === row.id"
              @click="addToPersonalKnowledge(row)"
            >
              加入个人知识库
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="knowledge-panel">
      <div class="panel-title">
        <div>
          <strong>课程知识库检索</strong>
          <span>检索会自动限定在当前课程，按资料标题选择即可。</span>
        </div>
      </div>
      <el-form label-position="top" @submit.prevent="retrieveDocuments">
        <el-form-item label="你的问题">
          <el-input v-model="form.query" type="textarea" :rows="3" placeholder="例如：FastAPI 的依赖注入适合解决什么问题？" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :xs="24" :md="16">
            <el-form-item label="限定资料（可选）">
              <el-select
                v-model="form.document_ids"
                class="full-width"
                multiple
                clearable
                filterable
                collapse-tags
                placeholder="按文档标题选择"
              >
                <el-option v-for="document in documents" :key="document.id" :label="document.title" :value="document.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="引用数量">
              <el-input-number v-model="form.top_k" :min="1" :max="10" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-button type="primary" :loading="retrieving" @click="retrieveDocuments">检索课程资料</el-button>
      </el-form>

      <div class="retrieve-results">
        <EmptyState
          v-if="hasRetrieved && !results.length"
          title="暂无匹配结果"
          description="可以换一种问法，或等待教师继续补充课程资料。"
        />
        <article v-for="(result, index) in results" :key="`${result.document_id || 'doc'}-${index}`" class="result-card">
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

    <section class="knowledge-panel private-note">
      <strong>我的私人知识库</strong>
      <span>点击上方“加入个人知识库”即可复制为自己的独立资料；复制后可在个人知识库中继续使用和管理。</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import { listCourseKnowledgeDocuments, retrieveCourseKnowledge } from '@/api/courseKnowledge'
import { copyCourseKnowledgeToPersonal } from '@/api/courseKnowledge'
import { downloadFile } from '@/api/files'
import EmptyState from '@/components/common/EmptyState.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { CourseKnowledgeDocument, CourseKnowledgeRetrieveResult } from '@/types/courseKnowledge'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  courseId: string | number
}>()

const documents = ref<CourseKnowledgeDocument[]>([])
const results = ref<CourseKnowledgeRetrieveResult[]>([])
const loading = ref(false)
const retrieving = ref(false)
const copyingId = ref<number | null>(null)
const downloadingId = ref<number | null>(null)
const hasRetrieved = ref(false)
const form = reactive({
  query: '',
  top_k: 5,
  document_ids: [] as number[]
})

async function loadDocuments() {
  loading.value = true
  try {
    const data = await listCourseKnowledgeDocuments(props.courseId, { page: 1, page_size: 100 })
    documents.value = data.items
  } finally {
    loading.value = false
  }
}

async function retrieveDocuments() {
  if (!form.query.trim()) {
    ElMessage.warning('请输入课程知识库检索问题。')
    return
  }
  retrieving.value = true
  hasRetrieved.value = true
  try {
    const data = await retrieveCourseKnowledge(props.courseId, {
      query: form.query.trim(),
      top_k: form.top_k,
      document_ids: form.document_ids.length ? form.document_ids : null
    })
    results.value = data.results
  } finally {
    retrieving.value = false
  }
}

async function downloadCourseDocument(document: CourseKnowledgeDocument) {
  if (!document.file_id) return
  downloadingId.value = document.id
  try {
    const blob = await downloadFile(document.file_id)
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = document.filename || `${document.title}.bin`
    window.document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } finally {
    downloadingId.value = null
  }
}

async function addToPersonalKnowledge(document: CourseKnowledgeDocument) {
  copyingId.value = document.id
  try {
    const result = await copyCourseKnowledgeToPersonal(props.courseId, document.id)
    document.added_to_personal = true
    document.personal_document_id = result.personal_document_id
    document.personal_document_status = result.status
    ElMessage.success(
      result.already_added
        ? '该资料已经在你的个人知识库中。'
        : `已加入个人知识库，共 ${result.chunk_count} 个分块。`
    )
  } finally {
    copyingId.value = null
  }
}

onMounted(loadDocuments)
</script>

<style scoped>
.student-course-knowledge-tab,
.knowledge-panel,
.retrieve-results {
  display: grid;
  gap: 16px;
}

.knowledge-panel {
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
.private-note span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.knowledge-table,
.full-width {
  width: 100%;
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

.private-note {
  background: var(--el-fill-color-extra-light);
}
</style>
