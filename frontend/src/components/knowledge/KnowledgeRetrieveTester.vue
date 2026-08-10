<template>
  <el-card shadow="never" class="retrieve-tester">
    <template #header>
      <div class="panel-header">
        <strong>检索测试</strong>
        <span>通过 Chroma 检索验证入库效果</span>
      </div>
    </template>

    <el-form label-position="top" @submit.prevent="handleRetrieve">
      <el-form-item label="检索问题">
        <el-input v-model="form.query" type="textarea" :rows="3" placeholder="这份资料如何说明模型评价？" />
      </el-form-item>
      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="指定文档">
            <el-select v-model="form.document_id" clearable filterable class="full-width" placeholder="可选文档">
              <el-option v-for="document in documents" :key="document.id" :label="document.title" :value="document.id" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="引用数量">
            <el-input-number v-model="form.top_k" :min="1" :max="10" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-button type="primary" :loading="loading" @click="handleRetrieve">开始检索</el-button>
    </el-form>

    <div class="retrieve-results">
      <EmptyState v-if="hasSearched && !results.length" title="暂无匹配片段" description="可以换一个问题，或先入库更多知识库文档。" />
      <article v-for="(result, index) in results" :key="index" class="retrieve-result-card">
        <div>
          <strong>{{ result.metadata.source_filename || `结果 ${index + 1}` }}</strong>
          <el-tag size="small">相关片段</el-tag>
          <el-tag v-if="result.score !== null && result.score !== undefined" size="small" type="info">
            相似度 {{ Number(result.score).toFixed(4) }}
          </el-tag>
        </div>
        <p>{{ result.content }}</p>
      </article>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive, ref } from 'vue'

import { retrieveKnowledge, type KnowledgeDocument, type KnowledgeReferenceResult } from '@/api/knowledge'
import EmptyState from '@/components/common/EmptyState.vue'

defineProps<{
  documents: KnowledgeDocument[]
}>()

const loading = ref(false)
const hasSearched = ref(false)
const results = ref<KnowledgeReferenceResult[]>([])
const form = reactive({
  query: '',
  document_id: null as number | null,
  top_k: 5
})

async function handleRetrieve() {
  if (!form.query.trim()) {
    ElMessage.warning('请输入检索问题。')
    return
  }
  loading.value = true
  hasSearched.value = true
  try {
    const data = await retrieveKnowledge({
      query: form.query.trim(),
      document_id: form.document_id,
      top_k: form.top_k
    })
    results.value = data.results
  } finally {
    loading.value = false
  }
}
</script>
