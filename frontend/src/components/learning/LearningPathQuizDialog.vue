<template>
  <el-dialog :model-value="modelValue" title="步骤小测" width="720px" @update:model-value="$emit('update:modelValue', $event)">
    <el-form label-position="top" class="quiz-dialog-form">
      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="题目数量">
            <el-input-number v-model="form.question_count" :min="1" :max="10" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="难度">
            <el-select v-model="form.difficulty" class="full-width">
              <el-option label="基础" value="easy" />
              <el-option label="常规" value="normal" />
              <el-option label="困难" value="hard" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-button type="primary" :loading="loading" :disabled="stepIndex === null" @click="$emit('generate', form)">
        为第 {{ stepIndex === null ? '-' : stepIndex + 1 }} 步生成小测
      </el-button>
    </el-form>

    <el-divider />
    <EmptyState v-if="!quiz" title="暂无小测" description="为当前路径步骤生成轻量小测。" />
    <div v-else class="quiz-dialog-result">
      <MarkdownViewer :content="quiz.quiz_markdown" />
      <div v-if="quiz.questions?.length" class="quiz-question-list">
        <el-card v-for="(question, index) in quiz.questions" :key="`${question.question}-${index}`" shadow="never">
          <strong>{{ index + 1 }}. {{ question.question }}</strong>
          <p>{{ question.answer }}</p>
        </el-card>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

import type { LearningPathQuizRequest, LearningPathQuizResponse } from '@/api/learningPaths'
import EmptyState from '@/components/common/EmptyState.vue'
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue'

defineProps<{
  modelValue: boolean
  stepIndex: number | null
  quiz: LearningPathQuizResponse | null
  loading?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  generate: [payload: Omit<LearningPathQuizRequest, 'step_index'>]
}>()

const form = reactive<Omit<LearningPathQuizRequest, 'step_index'>>({
  question_count: 5,
  difficulty: 'normal'
})
</script>
