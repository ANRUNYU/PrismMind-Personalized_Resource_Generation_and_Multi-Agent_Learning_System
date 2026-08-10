<template>
  <div class="test-result-panel">
    <el-alert
      type="success"
      :title="`得分：${result.score}`"
      :description="localizeLearningText(result.feedback || result.analysis) || '测试已提交并完成评分。'"
      :closable="false"
      show-icon
    />
    <div v-if="result.analysis" class="test-result-panel__section">
      <strong>结果分析</strong>
      <p>{{ localizeLearningText(result.analysis) }}</p>
    </div>
    <QualityAnalysisPanel :analysis="result.quality_analysis" />
    <div class="quiz-question-list">
      <el-card v-for="item in result.question_results" :key="item.question_id" shadow="never">
        <div class="panel-header">
          <strong>{{ item.question_id }} · {{ formatQuestionType(item.question_type) }}</strong>
          <el-tag :type="item.is_correct ? 'success' : 'danger'">{{ item.score }} / {{ item.max_score }}</el-tag>
        </div>
        <p>{{ localizeLearningText(item.analysis) || '暂无解析。' }}</p>
        <div class="test-result-panel__answers">
          <span>你的答案：{{ renderAnswer(item.user_answer) }}</span>
          <span>标准答案：{{ renderAnswer(item.correct_answer) }}</span>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import QualityAnalysisPanel from '@/components/common/QualityAnalysisPanel.vue'
import type { TestAnswerValue, TestSubmitResponse } from '@/types/test'
import { formatQuestionType, localizeLearningText } from '@/utils/format'

defineProps<{
  result: TestSubmitResponse
}>()

function renderAnswer(value?: TestAnswerValue | null) {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? '正确' : '错误'
  return value || '-'
}
</script>
