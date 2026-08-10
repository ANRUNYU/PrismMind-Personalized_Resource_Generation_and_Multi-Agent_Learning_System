<template>
  <GenerationPageShell
    :title="config.title"
    :description="config.description"
    :loading="loading"
    :result="result"
    :references="result?.references || []"
    :warnings="result?.warnings || []"
    @clear="result = null"
  >
    <template #actions>
      <el-button text @click="resetForm">重置</el-button>
    </template>

    <template #form>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="handleSubmit">
        <template v-for="field in config.fields" :key="field.key">
          <el-form-item :label="field.label" :prop="field.key">
            <el-input
              v-if="field.type === 'input'"
              v-model="form[field.key]"
              :placeholder="field.placeholder"
              clearable
            />
            <el-input
              v-else-if="field.type === 'textarea' || field.type === 'multiline'"
              v-model="form[field.key]"
              type="textarea"
              :rows="field.rows || (field.type === 'multiline' ? 4 : 3)"
              :placeholder="field.placeholder"
            />
            <el-input-number
              v-else-if="field.type === 'number'"
              :model-value="numberValue(field.key)"
              :min="field.min"
              :max="field.max"
              controls-position="right"
              @update:model-value="(value) => setFieldValue(field.key, value)"
            />
            <el-select v-else-if="field.type === 'select'" v-model="form[field.key]" class="full-width">
              <el-option v-for="option in field.options" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </el-form-item>
        </template>

        <el-collapse class="advanced-panel">
          <el-collapse-item title="高级引用" name="references">
            <ReferenceSelector v-model="referenceForm" />
          </el-collapse-item>
        </el-collapse>

        <el-button class="generate-button" type="primary" size="large" :loading="loading" @click="handleSubmit">
          同步生成
        </el-button>
        <el-button class="generate-button" size="large" :loading="asyncLoading" @click="handleAsyncSubmit">
          异步生成
        </el-button>
      </el-form>
      <TaskPollingPanel
        v-if="asyncTaskId"
        class="teacher-generation-page__task"
        :task-id="asyncTaskId"
        @completed="handleTaskCompleted"
      />
    </template>
  </GenerationPageShell>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'

import GenerationPageShell from '@/components/teacher/GenerationPageShell.vue'
import ReferenceSelector, { type ReferenceFormModel } from '@/components/teacher/ReferenceSelector.vue'
import TaskPollingPanel from '@/components/tasks/TaskPollingPanel.vue'
import type { TeacherGenerationPayload, TeacherGenerationResponse } from '@/api/teacher'
import type { TaskDetail } from '@/types/task'
import { createInitialForm, generationConfigs, multilineToArray, type GenerationFormValue, type GenerationKind } from './generationConfigs'

const props = defineProps<{
  kind: GenerationKind
}>()

const config = computed(() => generationConfigs[props.kind])
const formRef = ref<FormInstance>()
const form = reactive<Record<string, GenerationFormValue>>(createInitialForm(config.value))
const loading = ref(false)
const asyncLoading = ref(false)
const asyncTaskId = ref<number | null>(null)
const result = ref<TeacherGenerationResponse | null>(null)
const referenceForm = ref<ReferenceFormModel>({
  selectedFileIds: [],
  selectedKnowledgeDocumentIds: [],
  useKnowledgeBase: false,
  retrievalQuery: '',
  topK: 5
})

const rules = computed<FormRules>(() => {
  const entries: FormRules = {}
  config.value.fields.forEach((field) => {
    const fieldRules = []
    if (field.required) {
      fieldRules.push({ required: true, message: `请填写${field.label}。`, trigger: 'blur' })
    }
    if (field.type === 'number') {
      fieldRules.push({
        type: 'number',
        min: field.min,
        max: field.max,
        message: `${field.label} 超出范围。`,
        trigger: 'change'
      })
    }
    if (fieldRules.length) entries[field.key] = fieldRules
  })
  return entries
})

watch(
  () => props.kind,
  () => {
    resetForm()
    result.value = null
    asyncTaskId.value = null
  }
)

function resetForm() {
  Object.keys(form).forEach((key) => delete form[key])
  Object.assign(form, createInitialForm(config.value))
  formRef.value?.clearValidate()
}

function numberValue(key: string): number | null {
  const value = form[key]
  return typeof value === 'number' ? value : null
}

function setFieldValue(key: string, value: number | undefined) {
  form[key] = value ?? null
}

function uniqueIds(...groups: Array<number[] | undefined>): number[] | undefined {
  const ids = [...new Set(groups.flatMap((group) => group || []))]
  return ids.length ? ids : undefined
}

function buildPayload(): TeacherGenerationPayload {
  const payload: TeacherGenerationPayload = {}
  config.value.fields.forEach((field) => {
    const value = form[field.key]
    if (field.type === 'multiline') {
      const items = multilineToArray(value)
      if (items.length) payload[field.key] = items
      return
    }
    if (value !== '' && value !== null && value !== undefined) {
      payload[field.key] = value
    }
  })

  const fileIds = uniqueIds(referenceForm.value.selectedFileIds)
  const knowledgeDocumentIds = uniqueIds(referenceForm.value.selectedKnowledgeDocumentIds)
  if (fileIds) payload.file_ids = fileIds
  if (knowledgeDocumentIds) payload.knowledge_document_ids = knowledgeDocumentIds
  payload.use_knowledge_base = referenceForm.value.useKnowledgeBase
  payload.top_k = referenceForm.value.topK
  if (referenceForm.value.retrievalQuery.trim()) payload.retrieval_query = referenceForm.value.retrievalQuery.trim()
  return payload
}

async function handleSubmit() {
  await formRef.value?.validate()
  loading.value = true
  try {
    const data = await config.value.submit(buildPayload())
    result.value = data
    ElMessage.success('生成完成')
  } finally {
    loading.value = false
  }
}

async function handleAsyncSubmit() {
  await formRef.value?.validate()
  asyncLoading.value = true
  try {
    const task = await config.value.submitAsync(buildPayload())
    asyncTaskId.value = task.task_id
    ElMessage.success('异步任务已提交，可在任务中心查看进度。')
  } finally {
    asyncLoading.value = false
  }
}

function handleTaskCompleted(task: TaskDetail) {
  if (task.result_artifact_id) {
    ElMessage.success('异步生成完成，生成产物已就绪。')
  }
}
</script>
