<template>
  <el-card shadow="never" class="tutoring-input-panel">
    <template #header>
      <div class="panel-header">
        <strong>向智能导师提问</strong>
        <span>可选知识库上下文</span>
      </div>
    </template>

    <el-form label-position="top">
      <el-form-item label="模式">
        <el-segmented v-model="local.mode" :options="modeOptions" block />
      </el-form-item>
      <el-form-item :label="local.mode === 'explain' ? '概念' : '问题'">
        <el-input
          v-model="local.text"
          type="textarea"
          :rows="4"
          :placeholder="local.mode === 'explain' ? '例如：反向传播' : '请输入你的学习问题'"
        />
      </el-form-item>
      <el-form-item v-if="local.mode === 'hint'" label="上下文">
        <el-input v-model="local.context" type="textarea" :rows="2" placeholder="你已经尝试了什么？卡在哪里？" />
      </el-form-item>
      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="难度">
            <el-select v-model="local.difficulty" class="full-width">
              <el-option label="基础" value="easy" />
              <el-option label="常规" value="normal" />
              <el-option label="进阶" value="advanced" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="引用数量">
            <el-input-number v-model="local.topK" :min="1" :max="10" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="使用知识库">
        <el-switch v-model="local.useKnowledgeBase" />
      </el-form-item>
      <el-form-item label="知识库文档">
        <el-select
          v-model="local.knowledgeDocumentIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          class="full-width"
          placeholder="可选已入库文档"
        >
          <el-option
            v-for="document in documents"
            :key="document.id"
            :label="`${document.title}（${document.status}）`"
            :value="document.id"
          />
        </el-select>
      </el-form-item>
      <el-button type="primary" class="full-width" :loading="loading" @click="submit">发送</el-button>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive } from 'vue'

import type { KnowledgeDocument } from '@/api/knowledge'
import type { TutoringDifficulty, TutoringMode } from '@/api/tutoring'

const props = defineProps<{
  loading?: boolean
  documents: KnowledgeDocument[]
}>()

const emit = defineEmits<{
  submit: [
    payload: {
      mode: TutoringMode
      text: string
      context?: string
      difficulty: TutoringDifficulty
      useKnowledgeBase: boolean
      knowledgeDocumentIds: number[]
      topK: number
    }
  ]
}>()

const modeOptions = [
  { label: '提问', value: 'ask' },
  { label: '提示', value: 'hint' },
  { label: '解释', value: 'explain' }
]

const local = reactive({
  mode: 'ask' as TutoringMode,
  text: '',
  context: '',
  difficulty: 'normal' as TutoringDifficulty,
  useKnowledgeBase: true,
  knowledgeDocumentIds: [] as number[],
  topK: 5
})

function submit() {
  if (!local.text.trim()) {
    ElMessage.warning('请输入问题或概念。')
    return
  }
  emit('submit', {
    mode: local.mode,
    text: local.text.trim(),
    context: local.context.trim(),
    difficulty: local.difficulty,
    useKnowledgeBase: local.useKnowledgeBase,
    knowledgeDocumentIds: local.knowledgeDocumentIds,
    topK: local.topK
  })
}
</script>
