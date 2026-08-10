<template>
  <section class="page-stack">
    <div class="page-hero">
      <div>
        <span>File Center</span>
        <h1>文件中心</h1>
        <p>上传课程资料、教学文档和参考文件，供知识库入库或生成提示词引用。</p>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :xs="24" :lg="9">
        <FileUploadPanel @uploaded="handleUploaded" />
      </el-col>
      <el-col :xs="24" :lg="15">
        <el-card shadow="never" class="table-card">
          <template #header>
            <div class="panel-header">
              <strong>最近上传</strong>
              <span>{{ filesStore.total }} files</span>
            </div>
          </template>

          <EmptyState
            v-if="!filesStore.loading && !filesStore.recentFiles.length"
            title="暂无最近文件"
            description="上传文件后，可以在这里查看文件名、类型、大小并执行下载或删除。"
          />
          <el-table v-else v-loading="filesStore.loading" :data="filesStore.recentFiles" style="width: 100%">
            <el-table-column prop="original_filename" label="文件名" min-width="220" />
            <el-table-column prop="content_type" label="MIME" min-width="170" />
            <el-table-column label="大小" width="110">
              <template #default="{ row }">{{ formatFileSize(row.file_size) }}</template>
            </el-table-column>
            <el-table-column label="解析状态" width="120">
              <template #default="{ row }">
                <StatusTag :status="row.parse_status" />
              </template>
            </el-table-column>
            <el-table-column label="上传状态" width="110">
              <template #default="{ row }"><StatusTag :status="row.upload_status || 'succeeded'" /></template>
            </el-table-column>
            <el-table-column label="知识库入库" width="120">
              <template #default="{ row }"><StatusTag :status="row.knowledge_ingest_status || 'not_started'" /></template>
            </el-table-column>
            <el-table-column prop="parse_error" label="失败原因" min-width="200" show-overflow-tooltip />
            <el-table-column label="上传时间" width="180">
              <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="240" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.parse_status === 'failed'" text type="warning" @click="retry(row)">重试解析</el-button>
                <el-button v-if="row.knowledge_ingest_status === 'failed' && row.knowledge_document_id" text type="warning" @click="retryIngest(row)">重试入库</el-button>
                <el-button text type="primary" @click="filesStore.downloadRecentFile(row)">下载</el-button>
                <el-button text type="danger" @click="confirmDelete(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </section>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted } from 'vue'

import { retryParseFile, type FileAsset } from '@/api/files'
import { retryKnowledgeDocumentIngest } from '@/api/knowledge'
import EmptyState from '@/components/common/EmptyState.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import FileUploadPanel from '@/components/upload/FileUploadPanel.vue'
import { useFilesStore } from '@/stores/files'
import { formatDateTime, formatFileSize } from '@/utils/format'

const filesStore = useFilesStore()

onMounted(() => filesStore.fetchFiles())

function handleUploaded(file: FileAsset) {
  ElMessage.success(`文件“${file.original_filename}”已可用于创建知识库文档。`)
}

async function retry(file: FileAsset) {
  await retryParseFile(file.id)
  await filesStore.fetchFiles()
  ElMessage.success('解析任务已重新提交')
}

async function retryIngest(file: FileAsset) {
  await retryKnowledgeDocumentIngest(Number(file.knowledge_document_id))
  await filesStore.fetchFiles()
  ElMessage.success('入库任务已重新提交')
}

async function confirmDelete(file: FileAsset) {
  await ElMessageBox.confirm(`确认删除文件 ${file.original_filename}？删除后再次访问应由后端返回 404。`, '删除文件', { type: 'warning' })
  await filesStore.deleteRecentFile(file.id)
  ElMessage.success('文件已删除')
}
</script>
