<template>
  <div class="course-assignments-tab">
    <section class="assignment-panel">
      <div class="panel-title">
        <div>
          <strong>课程作业/测试</strong>
          <span>基于课程知识库范围、主题、难度和题量发布真实课程任务。</span>
        </div>
        <div class="panel-actions">
          <el-button :icon="Refresh" :loading="loading" @click="loadAssignments">刷新</el-button>
          <el-button type="primary" @click="openCreateDialog">发布作业/测试</el-button>
        </div>
      </div>

      <EmptyState
        v-if="!loading && !assignments.length"
        title="暂无课程作业/测试"
        description="点击发布按钮，基于课程主题或知识库资料生成一份测验。"
      />
      <el-table v-else v-loading="loading" :data="assignments" row-key="id" class="assignment-table">
        <el-table-column prop="title" label="任务名称" min-width="210" show-overflow-tooltip />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ formatCourseAssignmentType(row.assignment_type) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="难度" width="100">
          <template #default="{ row }">{{ formatDifficulty(row.difficulty) }}</template>
        </el-table-column>
        <el-table-column label="题数" width="80">
          <template #default="{ row }">{{ row.question_count }}</template>
        </el-table-column>
        <el-table-column label="提交" width="90">
          <template #default="{ row }">{{ row.submitted_count ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="截止时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.due_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openDetail(row.id)">查看详情</el-button>
            <el-button text type="success" @click="openSubmissions(row.id)">查看提交</el-button>
            <el-button text type="warning" :disabled="row.status === 'closed' || row.status === 'archived'" @click="closeAssignment(row)">
              关闭任务
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

    <el-dialog v-model="createVisible" title="发布课程作业/测试" width="720px">
      <el-alert
        v-if="!documents.length"
        class="dialog-alert"
        type="info"
        title="未选择课程资料时，将基于任务主题生成题目。"
        :closable="false"
      />
      <el-form ref="createFormRef" :model="createForm" :rules="rules" label-position="top">
        <el-row :gutter="14">
          <el-col :xs="24" :md="14">
            <el-form-item label="任务名称" prop="title">
              <el-input v-model="createForm.title" placeholder="例如：FastAPI 路由与数据校验随堂测验" maxlength="255" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="10">
            <el-form-item label="任务类型" prop="assignment_type">
              <el-select v-model="createForm.assignment_type" class="full-width">
                <el-option label="随堂测验" value="quiz" />
                <el-option label="课程作业" value="homework" />
                <el-option label="阶段考试" value="exam" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="测试主题" prop="topic">
          <el-input v-model="createForm.topic" placeholder="例如：FastAPI 路由、依赖注入与 Pydantic 校验" maxlength="255" />
        </el-form-item>
        <el-form-item label="出题范围">
          <el-select
            v-model="createForm.knowledge_document_ids"
            class="full-width"
            multiple
            filterable
            clearable
            collapse-tags
            placeholder="按文档标题选择课程知识库资料"
          >
            <el-option v-for="document in documents" :key="document.id" :label="document.title" :value="document.id">
              <span>{{ document.title }}</span>
              <small v-if="document.filename"> · {{ document.filename }}</small>
            </el-option>
          </el-select>
        </el-form-item>
        <el-row :gutter="14">
          <el-col :xs="24" :md="8">
            <el-form-item label="难度" prop="difficulty">
              <el-select v-model="createForm.difficulty" class="full-width">
                <el-option label="基础" value="easy" />
                <el-option label="中等" value="medium" />
                <el-option label="困难" value="hard" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="题目数量" prop="question_count">
              <el-input-number v-model="createForm.question_count" :min="1" :max="20" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="时间限制（分钟）">
              <el-input-number v-model="createForm.time_limit_minutes" :min="1" :max="600" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="题型">
          <el-checkbox-group v-model="createForm.question_types">
            <el-checkbox label="single_choice">单选题</el-checkbox>
            <el-checkbox label="multiple_choice">多选题</el-checkbox>
            <el-checkbox label="true_false">判断题</el-checkbox>
            <el-checkbox label="short_answer">简答题</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="截止时间（可选）">
          <el-date-picker
            v-model="createForm.due_at"
            class="full-width"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss"
            placeholder="选择截止时间"
          />
        </el-form-item>
        <el-form-item label="任务说明">
          <el-input v-model="createForm.description" type="textarea" :rows="3" maxlength="2000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">生成并发布</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="任务详情与标准答案" size="640px">
      <LoadingState v-if="detailLoading" />
      <div v-else-if="selectedAssignment" class="drawer-body">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="任务名称">{{ selectedAssignment.title }}</el-descriptions-item>
          <el-descriptions-item label="状态"><StatusTag :status="selectedAssignment.status" /></el-descriptions-item>
          <el-descriptions-item label="主题">{{ selectedAssignment.topic || '-' }}</el-descriptions-item>
          <el-descriptions-item label="题量">{{ selectedAssignment.question_count }}</el-descriptions-item>
        </el-descriptions>
        <QualityAnalysisPanel :analysis="selectedAssignment.quality_analysis" />
        <article v-for="question in selectedAssignment.questions" :key="question.id" class="question-preview">
          <div class="question-head">
            <strong>{{ question.id }}. {{ question.stem }}</strong>
            <el-tag size="small">{{ formatQuestionType(question.question_type) }}</el-tag>
          </div>
          <ol v-if="question.options?.length" class="option-list">
            <li v-for="option in question.options" :key="option.key">{{ option.key }}. {{ option.text }}</li>
          </ol>
          <div class="answer-box">
            <strong>标准答案：</strong>
            <span>{{ renderAnswer(selectedAssignment.answer_key?.[question.id]) }}</span>
          </div>
          <p v-if="selectedAssignment.explanations?.[question.id]" class="analysis">
            {{ selectedAssignment.explanations[question.id] }}
          </p>
        </article>
      </div>
    </el-drawer>

    <el-drawer v-model="submissionsVisible" title="提交概况" size="720px">
      <section v-if="teachingDiagnostics.submitted_count" class="teaching-diagnostics">
        <div class="diagnostic-metrics">
          <span><strong>{{ teachingDiagnostics.submitted_count }}</strong><small>已诊断学生</small></span>
          <span><strong>{{ formatDiagnosticScore(teachingDiagnostics.average_score) }}</strong><small>平均得分</small></span>
          <span><strong>{{ formatRate(teachingDiagnostics.average_score_rate) }}</strong><small>平均达成率</small></span>
        </div>
        <div class="diagnostic-section">
          <strong>班级高频薄弱知识点</strong>
          <div v-if="teachingDiagnostics.weak_topics.length" class="topic-tags">
            <el-tag v-for="item in teachingDiagnostics.weak_topics" :key="item.topic" type="danger" effect="plain">
              {{ item.topic }} · {{ item.student_count }} 人（{{ formatRate(item.rate) }}）
            </el-tag>
          </div>
          <p v-else>当前提交暂未形成集中薄弱知识点。</p>
        </div>
        <el-alert type="info" :title="teachingDiagnostics.evaluation" :closable="false" show-icon />
        <div class="diagnostic-section">
          <strong>教学方法与课堂着重点</strong>
          <ol>
            <li v-for="item in teachingDiagnostics.teaching_focus" :key="item">{{ item }}</li>
          </ol>
        </div>
      </section>
      <el-table v-loading="submissionsLoading" :data="submissions" row-key="id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="student-diagnostic-detail">
              <p><strong>学习评价：</strong>{{ submissionFeedbackText(row, 'analysis') || '暂无评价' }}</p>
              <p><strong>改进建议：</strong>{{ submissionFeedbackText(row, 'feedback') || '暂无建议' }}</p>
              <div>
                <strong>未掌握知识点：</strong>
                <el-tag v-for="topic in submissionTopics(row, 'incorrect_topics')" :key="topic" type="danger" size="small">{{ topic }}</el-tag>
                <span v-if="!submissionTopics(row, 'incorrect_topics').length">暂无明确薄弱点</span>
              </div>
              <div>
                <strong>已掌握知识点：</strong>
                <el-tag v-for="topic in submissionTopics(row, 'correct_topics')" :key="topic" type="success" size="small">{{ topic }}</el-tag>
                <span v-if="!submissionTopics(row, 'correct_topics').length">暂无记录</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="学生" min-width="160">
          <template #default="{ row }">{{ row.student_full_name || row.student_username || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="分数" width="100">
          <template #default="{ row }">{{ row.score ?? '-' }} / {{ row.max_score }}</template>
        </el-table-column>
        <el-table-column label="提交时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.submitted_at) }}</template>
        </el-table-column>
      </el-table>
      <EmptyState v-if="!submissionsLoading && !submissions.length" title="暂无提交" description="学生开始作答并提交后会显示在这里。" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, reactive, ref } from 'vue'

import {
  closeCourseAssignment,
  createCourseAssignment,
  getCourseAssignment,
  listCourseAssignments,
  listCourseAssignmentSubmissions
} from '@/api/courseAssignments'
import { listCourseKnowledgeDocuments } from '@/api/courseKnowledge'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QualityAnalysisPanel from '@/components/common/QualityAnalysisPanel.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import type {
  CourseAssignment,
  CourseAssignmentCreateRequest,
  CourseAssignmentListItem,
  CourseAssignmentSubmission,
  CourseTeachingDiagnostics,
  CourseAssignmentType
} from '@/types/courseAssignment'
import type { CourseAssignmentDifficulty } from '@/types/courseAssignment'
import type { CourseKnowledgeDocument } from '@/types/courseKnowledge'
import type { QuestionType } from '@/types/test'
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
const documents = ref<CourseKnowledgeDocument[]>([])
const submissions = ref<CourseAssignmentSubmission[]>([])
const teachingDiagnostics = ref<CourseTeachingDiagnostics>(emptyTeachingDiagnostics())
const selectedAssignment = ref<CourseAssignment | null>(null)
const loading = ref(false)
const creating = ref(false)
const detailLoading = ref(false)
const submissionsLoading = ref(false)
const createVisible = ref(false)
const detailVisible = ref(false)
const submissionsVisible = ref(false)
const total = ref(0)
const pagination = reactive({ page: 1, page_size: 20 })
const createFormRef = ref<FormInstance>()
const createForm = reactive({
  title: '',
  description: '',
  assignment_type: 'quiz' as CourseAssignmentType,
  topic: '',
  difficulty: 'medium' as CourseAssignmentDifficulty,
  question_count: 4,
  time_limit_minutes: null as number | null,
  due_at: null as string | null,
  knowledge_document_ids: [] as number[],
  question_types: ['single_choice', 'multiple_choice', 'true_false', 'short_answer'] as QuestionType[]
})

const rules: FormRules = {
  title: [{ required: true, min: 1, message: '请填写任务名称。', trigger: 'blur' }],
  topic: [{ required: true, min: 1, message: '请填写测试主题。', trigger: 'blur' }],
  assignment_type: [{ required: true, message: '请选择任务类型。', trigger: 'change' }],
  difficulty: [{ required: true, message: '请选择难度。', trigger: 'change' }],
  question_count: [{ required: true, type: 'number', message: '请设置题目数量。', trigger: 'change' }]
}

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

async function loadDocuments() {
  const data = await listCourseKnowledgeDocuments(props.courseId, { page: 1, page_size: 100 })
  documents.value = data.items.filter((document) => document.status === 'ingested' && document.chunk_count > 0)
}

function resetCreateForm() {
  createForm.title = 'FastAPI 路由与数据校验随堂测验'
  createForm.description = ''
  createForm.assignment_type = 'quiz'
  createForm.topic = 'FastAPI 路由与数据校验'
  createForm.difficulty = 'medium'
  createForm.question_count = 4
  createForm.time_limit_minutes = null
  createForm.due_at = null
  createForm.knowledge_document_ids = []
  createForm.question_types = ['single_choice', 'multiple_choice', 'true_false', 'short_answer']
}

async function openCreateDialog() {
  resetCreateForm()
  createVisible.value = true
  await loadDocuments()
}

async function submitCreate() {
  await createFormRef.value?.validate()
  if (!createForm.question_types.length) {
    ElMessage.warning('请至少选择一种题型。')
    return
  }
  creating.value = true
  try {
    const payload: CourseAssignmentCreateRequest = {
      title: createForm.title.trim(),
      description: createForm.description.trim() || null,
      assignment_type: createForm.assignment_type,
      difficulty: createForm.difficulty,
      question_count: createForm.question_count,
      time_limit_minutes: createForm.time_limit_minutes,
      due_at: createForm.due_at,
      topic: createForm.topic.trim(),
      knowledge_document_ids: createForm.knowledge_document_ids,
      question_types: createForm.question_types,
      generation_mode: 'ai',
      status: 'published'
    }
    const assignment = await createCourseAssignment(props.courseId, payload)
    ElMessage.success(`课程任务「${assignment.title}」已发布。`)
    createVisible.value = false
    await loadAssignments()
  } finally {
    creating.value = false
  }
}

async function openDetail(assignmentId: number) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    selectedAssignment.value = await getCourseAssignment(props.courseId, assignmentId)
  } finally {
    detailLoading.value = false
  }
}

async function openSubmissions(assignmentId: number) {
  submissionsVisible.value = true
  submissionsLoading.value = true
  submissions.value = []
  teachingDiagnostics.value = emptyTeachingDiagnostics()
  try {
    const data = await listCourseAssignmentSubmissions(props.courseId, assignmentId, { page: 1, page_size: 100 })
    submissions.value = data.items
    teachingDiagnostics.value = data.diagnostics || emptyTeachingDiagnostics()
  } finally {
    submissionsLoading.value = false
  }
}

async function closeAssignment(assignment: CourseAssignmentListItem) {
  try {
    await ElMessageBox.confirm(`确认关闭「${assignment.title}」？关闭后学生不能继续提交。`, '关闭任务', {
      type: 'warning'
    })
  } catch {
    return
  }
  await closeCourseAssignment(props.courseId, assignment.id)
  ElMessage.success('课程任务已关闭。')
  await loadAssignments()
}

function renderAnswer(value: unknown) {
  if (!value || typeof value !== 'object') return '-'
  const answer = (value as { answer?: unknown }).answer
  if (Array.isArray(answer)) return answer.join(', ')
  if (typeof answer === 'boolean') return answer ? '正确' : '错误'
  return String(answer ?? '-')
}

function emptyTeachingDiagnostics(): CourseTeachingDiagnostics {
  return {
    submitted_count: 0,
    average_score: null,
    average_score_rate: null,
    weak_topics: [],
    strong_topics: [],
    evaluation: '暂无学生提交，暂不能形成教学诊断。',
    teaching_focus: []
  }
}

function formatDiagnosticScore(value?: number | null) {
  return value === null || value === undefined ? '-' : Number(value).toFixed(1)
}

function formatRate(value?: number | null) {
  return value === null || value === undefined ? '-' : `${Math.round(Number(value) * 100)}%`
}

function submissionTopics(submission: CourseAssignmentSubmission, key: 'incorrect_topics' | 'correct_topics') {
  const value = submission.feedback?.[key]
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function submissionFeedbackText(submission: CourseAssignmentSubmission, key: 'analysis' | 'feedback') {
  const value = submission.feedback?.[key]
  return typeof value === 'string' ? value : ''
}

async function loadAll() {
  await Promise.all([loadAssignments(), loadDocuments()])
}

onMounted(loadAll)
</script>

<style scoped>
.course-assignments-tab,
.assignment-panel,
.drawer-body {
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

.panel-title > div:first-child {
  display: grid;
  gap: 4px;
}

.panel-title span {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.full-width,
.assignment-table {
  width: 100%;
}

.dialog-alert {
  margin-bottom: 12px;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
}

.question-preview {
  display: grid;
  gap: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 14px;
  background: var(--el-fill-color-extra-light);
}

.question-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.option-list {
  margin: 0;
  padding-left: 20px;
  line-height: 1.8;
}

.answer-box {
  color: var(--el-text-color-primary);
}

.analysis {
  margin: 0;
  color: var(--el-text-color-secondary);
  line-height: 1.7;
}

.teaching-diagnostics,
.diagnostic-section,
.student-diagnostic-detail {
  display: grid;
  gap: 12px;
}

.teaching-diagnostics {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-fill-color-extra-light);
}

.diagnostic-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.diagnostic-metrics span {
  display: grid;
  gap: 3px;
  padding: 10px;
  border-radius: 8px;
  background: var(--el-bg-color);
}

.diagnostic-metrics strong {
  color: var(--el-color-primary);
  font-size: 20px;
}

.diagnostic-metrics small,
.diagnostic-section p,
.student-diagnostic-detail span {
  color: var(--el-text-color-secondary);
}

.topic-tags,
.student-diagnostic-detail > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.diagnostic-section ol {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 22px;
  line-height: 1.65;
}

.student-diagnostic-detail {
  padding: 8px 18px 14px;
}

.student-diagnostic-detail p {
  margin: 0;
  line-height: 1.65;
}

@media (max-width: 760px) {
  .panel-title {
    display: grid;
  }

  .diagnostic-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
