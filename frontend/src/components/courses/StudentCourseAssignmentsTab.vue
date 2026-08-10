<template>
  <div class="student-course-assignments-tab">
    <section class="assignment-panel">
      <div class="panel-title">
        <div>
          <strong>课程作业/测试</strong>
          <span>查看教师发布的课程任务，完成作答后可查看得分与解析。</span>
        </div>
        <el-button :icon="Refresh" :loading="loading" @click="loadAssignments">刷新</el-button>
      </div>

      <EmptyState
        v-if="!loading && !assignments.length"
        title="暂无已发布任务"
        description="教师发布课程作业或测试后，会显示在这里。"
      />
      <el-table v-else v-loading="loading" :data="assignments" row-key="id" class="assignment-table">
        <el-table-column prop="title" label="任务名称" min-width="220" show-overflow-tooltip />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ formatCourseAssignmentType(row.assignment_type) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <StatusTag :status="row.current_student_submission_status || assignmentVisibleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column label="难度" width="100">
          <template #default="{ row }">{{ formatDifficulty(row.difficulty) }}</template>
        </el-table-column>
        <el-table-column label="分数" width="100">
          <template #default="{ row }">
            {{ row.current_student_score === null || row.current_student_score === undefined ? '-' : row.current_student_score }}
          </template>
        </el-table-column>
        <el-table-column label="截止时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.due_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text :disabled="isClosedWithoutResult(row)" @click="handleAssignmentAction(row)">
              {{ actionLabel(row) }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.page_size"
          background
          layout="total, prev, pager, next"
          :total="total"
          @current-change="loadAssignments"
        />
      </div>
    </section>

    <el-dialog v-model="answerVisible" :title="currentAssignment?.title || '课程作业/测试'" width="820px">
      <LoadingState v-if="detailLoading" />
      <div v-else-if="currentAssignment" class="answer-dialog">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="任务类型">{{ formatCourseAssignmentType(currentAssignment.assignment_type) }}</el-descriptions-item>
          <el-descriptions-item label="任务状态"><StatusTag :status="currentAssignment.status" /></el-descriptions-item>
          <el-descriptions-item label="题目数量">{{ currentAssignment.question_count }}</el-descriptions-item>
          <el-descriptions-item label="总分">{{ currentAssignment.total_score }}</el-descriptions-item>
          <el-descriptions-item label="截止时间">{{ formatDateTime(currentAssignment.due_at) }}</el-descriptions-item>
          <el-descriptions-item label="时间限制">
            {{ currentAssignment.time_limit_minutes ? `${currentAssignment.time_limit_minutes} 分钟` : '不限时' }}
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="!submittedResult && !currentAssignment.answer_key"
          type="info"
          title="提交前仅显示题目与作答区域。"
          :closable="false"
        />

        <TestQuestionRenderer
          v-if="!submittedResult"
          v-model="answers"
          :questions="currentAssignment.questions"
          :disabled="isSubmitted(currentAssignment)"
        />

        <section v-if="submittedResult" class="result-panel">
          <el-alert
            type="success"
            :title="`得分：${submittedResult.score} / ${submittedResult.max_score}`"
            :description="submittedResult.feedback || submittedResult.analysis"
            :closable="false"
            show-icon
          />
          <QualityAnalysisPanel :analysis="submittedResult.quality_analysis || currentAssignment.quality_analysis" />
          <article v-for="item in submittedResult.question_results" :key="item.question_id" class="result-card">
            <div class="result-card__head">
              <strong>{{ item.question_id }} · {{ formatQuestionType(item.question_type) }}</strong>
              <el-tag :type="item.is_correct ? 'success' : 'danger'">{{ item.score }} / {{ item.max_score }}</el-tag>
            </div>
            <p>{{ item.analysis || '暂无解析。' }}</p>
            <div v-if="item.knowledge_points?.length" class="result-card__topics">
              <strong>诊断知识点：</strong>
              <el-tag v-for="point in item.knowledge_points" :key="point" size="small" effect="plain">{{ point }}</el-tag>
            </div>
            <div class="result-card__answers">
              <span>你的答案：{{ renderAnswer(item.user_answer) }}</span>
              <span>标准答案：{{ renderAnswer(item.correct_answer) }}</span>
            </div>
            <p v-if="item.grading_basis" class="grading-basis"><strong>判分依据：</strong>{{ item.grading_basis }}</p>
            <details v-if="item.knowledge_evidence?.length" class="knowledge-evidence">
              <summary>查看课程知识库证据（{{ item.knowledge_evidence.length }} 条）</summary>
              <blockquote v-for="evidence in item.knowledge_evidence" :key="`${evidence.document_id}-${evidence.chunk_id}`">
                <strong>{{ evidence.source_filename || '课程知识库' }}</strong>
                <p>{{ evidence.excerpt }}</p>
              </blockquote>
            </details>
          </article>
        </section>
      </div>
      <template #footer>
        <el-button @click="answerVisible = false">关闭</el-button>
        <el-button
          v-if="currentAssignment && !submittedResult && !isSubmitted(currentAssignment)"
          type="primary"
          :loading="submitting"
          @click="submitAnswers"
        >
          提交答案
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import {
  getCourseAssignment,
  listCourseAssignments,
  startCourseAssignment,
  submitCourseAssignment
} from '@/api/courseAssignments'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QualityAnalysisPanel from '@/components/common/QualityAnalysisPanel.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TestQuestionRenderer from '@/components/tests/TestQuestionRenderer.vue'
import type {
  CourseAssignment,
  CourseAssignmentListItem,
  CourseAssignmentSubmitResponse
} from '@/types/courseAssignment'
import type { TestAnswerValue } from '@/types/test'
import {
  formatCourseAssignmentType,
  formatDateTime,
  formatDifficulty,
  formatQuestionType
} from '@/utils/format'

const props = defineProps<{
  courseId: string | number
}>()

const assignments = ref<CourseAssignmentListItem[]>([])
const currentAssignment = ref<CourseAssignment | null>(null)
const submittedResult = ref<CourseAssignmentSubmitResponse | null>(null)
const answers = ref<Record<string, TestAnswerValue>>({})
const total = ref(0)
const loading = ref(false)
const detailLoading = ref(false)
const submitting = ref(false)
const answerVisible = ref(false)
const pagination = reactive({ page: 1, page_size: 20 })

async function loadAssignments() {
  loading.value = true
  try {
    const data = await listCourseAssignments(props.courseId, pagination)
    assignments.value = data.items
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function assignmentVisibleStatus(row: CourseAssignmentListItem) {
  if (row.status === 'closed') return 'closed'
  return 'not_started'
}

function isClosedWithoutResult(row: CourseAssignmentListItem) {
  return row.status === 'closed' && !['submitted', 'graded'].includes(String(row.current_student_submission_status || ''))
}

function actionLabel(row: CourseAssignmentListItem) {
  const status = row.current_student_submission_status
  if (status === 'graded' || status === 'submitted') return '查看结果'
  if (status === 'in_progress') return '继续作答'
  if (row.status === 'closed') return '已关闭'
  return '开始作答'
}

function isSubmitted(assignment: CourseAssignment) {
  const status = assignment.current_student_submission?.status
  return status === 'submitted' || status === 'graded'
}

async function handleAssignmentAction(row: CourseAssignmentListItem) {
  submittedResult.value = null
  answers.value = {}
  answerVisible.value = true
  detailLoading.value = true
  try {
    if (row.current_student_submission_status === 'graded' || row.current_student_submission_status === 'submitted') {
      const detail = await getCourseAssignment(props.courseId, row.id)
      currentAssignment.value = detail
      const submission = detail.current_student_submission
      if (submission) {
        answers.value = submission.answers || {}
        submittedResult.value = {
          assignment_id: detail.id,
          submission_id: submission.id,
          status: submission.status,
          score: submission.score || 0,
          max_score: submission.max_score,
          analysis: String(submission.feedback?.analysis || ''),
          feedback: String(submission.feedback?.feedback || ''),
          question_results: submission.question_results || [],
          answer_key: detail.answer_key || {},
          recommendations: Array.isArray(submission.feedback?.recommendations)
            ? (submission.feedback.recommendations as string[])
            : [],
          quality_analysis: submission.quality_analysis || detail.quality_analysis
        }
      }
      return
    }
    const data = await startCourseAssignment(props.courseId, row.id)
    currentAssignment.value = data.assignment
    answers.value = data.submission.answers || {}
  } finally {
    detailLoading.value = false
  }
}

async function submitAnswers() {
  if (!currentAssignment.value) return
  if (!Object.keys(answers.value).length) {
    ElMessage.warning('请至少作答一题后再提交。')
    return
  }
  submitting.value = true
  try {
    submittedResult.value = await submitCourseAssignment(props.courseId, currentAssignment.value.id, {
      answers: answers.value
    })
    window.dispatchEvent(new CustomEvent('student-profile-updated', { detail: submittedResult.value.profile_snapshot || {} }))
    currentAssignment.value = await getCourseAssignment(props.courseId, currentAssignment.value.id)
    ElMessage.success('答案已提交，系统已依据课程知识库完成评分并更新学习画像。')
    await loadAssignments()
  } finally {
    submitting.value = false
  }
}

function renderAnswer(value: unknown) {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? '正确' : '错误'
  return String(value ?? '-')
}

onMounted(loadAssignments)
</script>

<style scoped>
.student-course-assignments-tab,
.assignment-panel,
.answer-dialog,
.result-panel {
  display: grid;
  gap: 16px;
}

.assignment-panel {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 16px;
  background: var(--el-bg-color);
}

.panel-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-title > div {
  display: grid;
  gap: 4px;
}

.panel-title span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.assignment-table {
  width: 100%;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
}

.result-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 14px;
  background: var(--el-fill-color-extra-light);
}

.result-card p {
  margin: 0;
  color: var(--el-text-color-regular);
  line-height: 1.7;
}

.result-card__head,
.result-card__answers {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.result-card__topics {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.grading-basis {
  color: var(--el-color-primary) !important;
}

.knowledge-evidence summary {
  cursor: pointer;
  color: var(--el-color-primary);
}

.knowledge-evidence blockquote {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-left: 3px solid var(--el-color-primary-light-5);
  background: var(--el-fill-color-light);
}

.knowledge-evidence blockquote p {
  margin-top: 4px;
  font-size: 13px;
}

.result-card__answers {
  color: var(--el-text-color-secondary);
  flex-wrap: wrap;
}
</style>
