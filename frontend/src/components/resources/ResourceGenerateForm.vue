<template>
  <el-card shadow="never" class="resource-form-card">
    <template #header>
      <div class="panel-header">
        <strong>生成学习资源</strong>
        <span>结合画像与知识库进行个性化生成</span>
      </div>
    </template>

    <el-form label-position="top">
      <el-form-item label="主题" required>
        <el-input v-model="form.topic" placeholder="例如：过拟合与正则化" />
      </el-form-item>

      <el-form-item label="生成模式">
        <el-radio-group v-model="generationMode">
          <el-radio-button label="batch">批量资源</el-radio-button>
          <el-radio-button label="single">单项资源</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="generationMode === 'batch'" label="资源类型" required>
        <el-checkbox-group v-model="form.resource_types">
          <el-checkbox-button v-for="item in resourceTypeOptions" :key="item.value" :label="item.value">
            {{ item.label }}
          </el-checkbox-button>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item v-else label="资源类型" required>
        <el-select v-model="singleResourceType" class="full-width">
          <el-option v-for="item in resourceTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>

      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="难度">
            <el-select v-model="form.difficulty" class="full-width">
              <el-option label="基础" value="easy" />
              <el-option label="常规" value="normal" />
              <el-option label="困难" value="hard" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="课程关联">
            <el-alert
              type="info"
              :closable="false"
              title="使用系统默认课程上下文，无需填写课程编号。"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="知识点">
        <el-input v-model="knowledgePointsText" type="textarea" :rows="3" placeholder="每行一个，或用逗号分隔" />
      </el-form-item>

      <el-collapse class="advanced-panel">
        <el-collapse-item title="高级个性化" name="advanced">
          <el-form-item label="补充要求">
            <el-input v-model="form.additional_requirements" type="textarea" :rows="3" placeholder="语气、重点、约束或期望输出风格" />
          </el-form-item>
          <el-row :gutter="12">
            <el-col :xs="24" :sm="12">
              <el-form-item label="使用学习画像">
                <el-switch v-model="form.use_profile" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="使用知识库">
                <el-switch v-model="form.use_knowledge_base" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="引用知识库文档">
            <el-select
              v-model="form.knowledge_document_ids"
              :loading="knowledge.loading"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              class="full-width"
              placeholder="按文档标题选择，可留空由系统检索全部知识库"
            >
              <el-option
                v-for="document in knowledge.documents"
                :key="document.id"
                :label="document.title"
                :value="document.id"
              >
                <div class="entity-option">
                  <strong>{{ document.title }}</strong>
                  <span>{{ document.status }} · {{ document.chunk_count || 0 }} 个切片</span>
                </div>
              </el-option>
            </el-select>
            <div v-if="!knowledge.loading && !knowledge.documents.length" class="entity-empty">
              暂无知识库文档，可先到知识库页面上传并入库。
            </div>
          </el-form-item>
          <el-form-item label="引用数量">
            <el-input-number v-model="form.top_k" :min="1" :max="10" />
          </el-form-item>
        </el-collapse-item>
      </el-collapse>

      <div class="resource-form-card__actions">
        <el-button type="primary" :loading="loading" @click="submit">
          生成资源
        </el-button>
        <el-button :loading="asyncLoading" @click="submitAsync">
          异步生成
        </el-button>
      </div>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import type { ResourceGenerateRequest, ResourceGenerateSingleRequest, ResourceType } from '@/api/resources'
import { useKnowledgeStore } from '@/stores/knowledge'

defineProps<{
  loading?: boolean
  asyncLoading?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: ResourceGenerateRequest]
  'submit-single': [payload: ResourceGenerateSingleRequest]
  'submit-async': [payload: ResourceGenerateRequest]
  'submit-single-async': [payload: ResourceGenerateSingleRequest]
}>()

const resourceTypeOptions: Array<{ label: string; value: ResourceType }> = [
  { label: '概念讲解', value: 'concept_explanation' },
  { label: '案例分析', value: 'case_study' },
  { label: '练习任务', value: 'practice_task' },
  { label: '总结笔记', value: 'summary_notes' },
  { label: '小测验', value: 'quiz' },
  { label: '项目提示', value: 'project_hint' }
]

const knowledge = useKnowledgeStore()
const knowledgePointsText = ref('')
const generationMode = ref<'batch' | 'single'>('batch')
const singleResourceType = ref<ResourceType>('concept_explanation')
const form = reactive<ResourceGenerateRequest>({
  topic: '',
  course_id: null,
  resource_types: ['concept_explanation'],
  difficulty: 'normal',
  knowledge_points: [],
  use_profile: true,
  use_knowledge_base: false,
  knowledge_document_ids: [],
  top_k: 5,
  additional_requirements: ''
})

function splitText(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function submit() {
  const payload = buildPayload()
  if (!payload) return
  if (generationMode.value === 'single') {
    emit('submit-single', {
      ...payload,
      resource_type: singleResourceType.value
    })
    return
  }
  emit('submit', payload)
}

function submitAsync() {
  const payload = buildPayload()
  if (!payload) return
  if (generationMode.value === 'single') {
    emit('submit-single-async', {
      ...payload,
      resource_type: singleResourceType.value
    })
    return
  }
  emit('submit-async', payload)
}

function buildPayload(): ResourceGenerateRequest | null {
  if (!form.topic.trim()) {
    ElMessage.warning('请输入学习主题。')
    return null
  }
  if (!form.resource_types.length) {
    ElMessage.warning('请至少选择一种资源类型。')
    return null
  }
  return {
    ...form,
    topic: form.topic.trim(),
    course_id: null,
    knowledge_points: splitText(knowledgePointsText.value),
    knowledge_document_ids: form.knowledge_document_ids?.length ? form.knowledge_document_ids : null,
    additional_requirements: form.additional_requirements?.trim() || null
  }
}

onMounted(() => {
  if (!knowledge.documents.length) {
    knowledge.fetchDocuments()
  }
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
