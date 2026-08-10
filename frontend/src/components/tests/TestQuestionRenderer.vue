<template>
  <div class="test-question-renderer">
    <el-card v-for="question in questions" :key="question.id" shadow="never" class="test-question-card">
      <div class="test-question-card__head">
        <strong>{{ question.id }}. {{ question.stem }}</strong>
        <el-tag size="small">{{ formatQuestionType(question.question_type) }}</el-tag>
      </div>
      <div class="test-question-card__meta">
        <span>{{ question.score ?? 0 }} 分</span>
        <el-tag v-for="point in question.knowledge_points || []" :key="point" size="small" type="info">{{ point }}</el-tag>
      </div>

      <el-radio-group
        v-if="question.question_type === 'single_choice'"
        :model-value="modelValue[question.id] as string | undefined"
        :disabled="disabled"
        @update:model-value="(value) => updateAnswer(question.id, String(value))"
      >
        <el-radio v-for="option in question.options || []" :key="option.key" :label="option.key">
          {{ option.key }}. {{ option.text }}
        </el-radio>
      </el-radio-group>

      <el-checkbox-group
        v-else-if="question.question_type === 'multiple_choice'"
        :model-value="arrayAnswer(question.id)"
        :disabled="disabled"
        @update:model-value="(value) => updateAnswer(question.id, value as string[])"
      >
        <el-checkbox v-for="option in question.options || []" :key="option.key" :label="option.key">
          {{ option.key }}. {{ option.text }}
        </el-checkbox>
      </el-checkbox-group>

      <el-radio-group
        v-else-if="question.question_type === 'true_false'"
        :model-value="modelValue[question.id] as boolean | undefined"
        :disabled="disabled"
        @update:model-value="(value) => updateAnswer(question.id, Boolean(value))"
      >
        <el-radio :label="true">正确</el-radio>
        <el-radio :label="false">错误</el-radio>
      </el-radio-group>

      <el-input
        v-else
        :model-value="String(modelValue[question.id] || '')"
        :disabled="disabled"
        type="textarea"
        :rows="4"
        placeholder="写下你的答案"
        @update:model-value="(value) => updateAnswer(question.id, value)"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import type { TestAnswerValue, TestQuestion } from '@/types/test'
import { formatQuestionType } from '@/utils/format'

const props = withDefaults(defineProps<{
  questions: TestQuestion[]
  modelValue: Record<string, TestAnswerValue>
  disabled?: boolean
}>(), {
  disabled: false
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, TestAnswerValue>]
}>()

function updateAnswer(questionId: string, answer: TestAnswerValue) {
  emit('update:modelValue', {
    ...props.modelValue,
    [questionId]: answer
  })
}

function arrayAnswer(questionId: string) {
  const value = props.modelValue[questionId]
  return Array.isArray(value) ? value : []
}
</script>
