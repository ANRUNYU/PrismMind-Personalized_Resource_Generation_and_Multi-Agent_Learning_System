<template>
  <el-card shadow="never" class="table-card">
    <template #header>
      <div class="panel-header">
        <strong>知识库文档</strong>
        <span>{{ documents.length }} loaded</span>
      </div>
    </template>

    <EmptyState
      v-if="!loading && !documents.length"
      title="暂无知识库文档"
      description="先上传文件并创建知识库文档，再执行同步或异步入库。"
    />
    <el-table v-else v-loading="loading" :data="documents" style="width: 100%">
      <el-table-column prop="title" label="标题" min-width="220" />
      <el-table-column prop="source_type" label="来源" width="120" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <StatusTag :status="row.status" />
        </template>
      </el-table-column>
      <el-table-column prop="chunk_count" label="分块数" width="100" />
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" @click="$emit('select', row)">选择</el-button>
          <el-button
            text
            type="success"
            :loading="ingestingIds.includes(row.id)"
            :disabled="row.status === 'ingested'"
            @click="$emit('ingest', row)"
          >
            同步入库
          </el-button>
          <el-button
            text
            type="primary"
            :loading="ingestingIds.includes(row.id)"
            :disabled="row.status === 'processing'"
            @click="$emit('ingest-async', row)"
          >
            异步入库
          </el-button>
          <el-button text type="danger" @click="$emit('delete', row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type { KnowledgeDocument } from '@/api/knowledge'
import { formatDateTime } from '@/utils/format'

withDefaults(defineProps<{
  documents: KnowledgeDocument[]
  loading?: boolean
  ingestingIds?: number[]
}>(), {
  loading: false,
  ingestingIds: () => []
})

defineEmits<{
  select: [document: KnowledgeDocument]
  ingest: [document: KnowledgeDocument]
  'ingest-async': [document: KnowledgeDocument]
  delete: [document: KnowledgeDocument]
}>()

</script>
