<template>
  <div class="reference-selector">
    <el-form-item label="使用知识库">
      <el-switch v-model="local.useKnowledgeBase" @change="emitChange" />
    </el-form-item>
    <el-form-item label="检索问题">
      <el-input
        v-model="local.retrievalQuery"
        type="textarea"
        :rows="3"
        placeholder="可选。不填写时由后端根据生成任务构造检索问题。"
        @input="emitChange"
      />
    </el-form-item>
    <el-form-item label="引用数量">
      <el-input-number v-model="local.topK" :min="1" :max="10" @change="emitChange" />
    </el-form-item>

    <el-divider content-position="left">引用文件</el-divider>
    <el-alert
      v-if="!filesStore.loading && !filesStore.recentFiles.length"
      type="info"
      :closable="false"
      title="暂无可引用文件，可先到文件中心上传后再引用。"
    />
    <el-form-item v-else label="最近上传文件">
      <el-select
        v-model="local.selectedFileIds"
        multiple
        filterable
        collapse-tags
        collapse-tags-tooltip
        class="full-width"
        :loading="filesStore.loading"
        placeholder="选择上传文件"
        @change="emitChange"
      >
        <el-option
          v-for="file in filesStore.recentFiles"
          :key="file.id"
          :label="file.original_filename"
          :value="file.id"
        />
      </el-select>
    </el-form-item>

    <el-divider content-position="left">知识库文档</el-divider>
    <div class="reference-selector__toolbar">
      <span>已加载 {{ readyDocuments.length }} 个已入库文档</span>
      <div>
        <el-button size="small" @click="openUpload">上传资料</el-button>
        <el-button size="small" :loading="knowledge.loading" @click="refreshAndSelectLatest">刷新并选择最新就绪资料</el-button>
      </div>
    </div>
    <el-form-item label="知识库文档">
      <el-select
        v-model="local.selectedKnowledgeDocumentIds"
        multiple
        filterable
        collapse-tags
        collapse-tags-tooltip
        class="full-width"
        placeholder="选择已入库文档"
        @change="handleDocumentSelectionChange"
      >
        <el-option
          v-for="document in readyDocuments"
          :key="document.id"
          :label="`${document.title} · ${document.chunk_count} 个分块`"
          :value="document.id"
        />
      </el-select>
    </el-form-item>
    <TeacherKnowledgeUploadDialog />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'

import TeacherKnowledgeUploadDialog from '@/components/teacher/TeacherKnowledgeUploadDialog.vue'
import { useFilesStore } from '@/stores/files'
import { useKnowledgeStore } from '@/stores/knowledge'

export interface ReferenceFormModel {
  selectedFileIds: number[]
  selectedKnowledgeDocumentIds: number[]
  useKnowledgeBase: boolean
  retrievalQuery: string
  topK: number
}

const props = defineProps<{
  modelValue: ReferenceFormModel
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ReferenceFormModel]
}>()

const filesStore = useFilesStore()
const knowledge = useKnowledgeStore()
const local = reactive<ReferenceFormModel>({ ...props.modelValue })
const readyDocuments = computed(() => knowledge.documents.filter((document) => document.status === 'ingested'))

watch(
  () => props.modelValue,
  (value) => Object.assign(local, value),
  { deep: true }
)

function emitChange() {
  emit('update:modelValue', { ...local })
}

function handleDocumentSelectionChange() {
  if (local.selectedKnowledgeDocumentIds.length) local.useKnowledgeBase = true
  emitChange()
}

function openUpload() {
  window.dispatchEvent(new Event('teacher-knowledge-upload-open'))
}

async function refreshAndSelectLatest() {
  await knowledge.fetchDocuments({ page: 1, page_size: 100, status: 'ingested' })
  const latest = readyDocuments.value[0]
  if (!latest) {
    ElMessage.info('知识库暂无已入库资料。')
    return
  }
  if (!local.selectedKnowledgeDocumentIds.includes(latest.id)) local.selectedKnowledgeDocumentIds.push(latest.id)
  local.useKnowledgeBase = true
  emitChange()
  ElMessage.success(`已选择最新资料：${latest.title}`)
}

async function handleKnowledgeUpdated(event: Event) {
  const documentId = Number((event as CustomEvent<{ documentId?: number }>).detail?.documentId || 0)
  await knowledge.fetchDocuments({ page: 1, page_size: 100, status: 'ingested' })
  if (documentId && !local.selectedKnowledgeDocumentIds.includes(documentId)) local.selectedKnowledgeDocumentIds.push(documentId)
  local.useKnowledgeBase = local.selectedKnowledgeDocumentIds.length > 0
  emitChange()
}

onMounted(() => {
  filesStore.fetchFiles()
  knowledge.fetchDocuments({ page: 1, page_size: 100, status: 'ingested' })
  window.addEventListener('teacher-knowledge-updated', handleKnowledgeUpdated)
})
onBeforeUnmount(() => window.removeEventListener('teacher-knowledge-updated', handleKnowledgeUpdated))
</script>

<style scoped>
.full-width { width: 100%; }
.reference-selector__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.reference-selector__toolbar > div { display: flex; flex-wrap: wrap; justify-content: flex-end; }
</style>
