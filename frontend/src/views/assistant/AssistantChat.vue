<template>
  <section class="assistant-page page-stack">
    <PageHeader
      title="智能聊天助手"
      description="面向教师备课、学生学习和管理员演示的统一问答入口，可结合课程知识库与本次上传附件进行中文回答。"
      eyebrow="智能助手"
      :icon="ChatRound"
    >
      <template #actions>
        <el-button :icon="Plus" type="primary" @click="startNewSession">新建会话</el-button>
        <el-button :icon="Refresh" :loading="sessionsLoading" @click="loadSessions">刷新历史</el-button>
      </template>
    </PageHeader>

    <el-row :gutter="18" class="assistant-layout">
      <el-col :xs="24" :lg="6">
        <ContentCard title="模型状态" subtitle="仅展示运行模式，不显示密钥">
          <LoadingState v-if="llmStatusLoading" :rows="2" min-height="96px" />
          <div v-else-if="llmStatus" class="assistant-model-status">
            <el-tag :type="llmStatus.real_provider_enabled ? 'success' : 'info'" effect="plain">
              {{ llmStatus.real_provider_enabled ? '真实模型模式' : '本地兜底模式' }}
            </el-tag>
            <strong>{{ llmStatus.provider }} / {{ llmStatus.model }}</strong>
            <p>{{ llmStatus.message }}</p>
          </div>
          <ErrorState v-else title="模型状态暂不可用" description="问答仍会使用稳定兜底模式，稍后可刷新页面重试。" />
        </ContentCard>

        <ContentCard title="会话历史" subtitle="仅显示当前账号的助手会话">
          <LoadingState v-if="sessionsLoading && !sessions.length" :rows="4" min-height="260px" />
          <EmptyState
            v-else-if="!sessions.length"
            title="暂无助手会话"
            description="选择课程或直接输入问题后，会自动创建新的聊天会话。"
          />
          <div v-else class="session-list assistant-session-list">
            <button
              v-for="session in sessions"
              :key="session.id"
              :class="['session-item', { 'session-item--active': currentSessionId === session.id }]"
              type="button"
              @click="selectSession(session.id)"
            >
              <div>
                <el-tag size="small">{{ modeLabel(session.mode) }}</el-tag>
                <span>{{ session.message_count }} 条</span>
              </div>
              <strong>{{ session.title }}</strong>
              <span>{{ formatDateTime(session.updated_at) }}</span>
            </button>
          </div>
        </ContentCard>
      </el-col>

      <el-col :xs="24" :lg="12">
        <ContentCard title="对话" subtitle="答案会优先引用课程知识库和本次附件">
          <div ref="threadRef" class="chat-thread assistant-thread">
            <EmptyState
              v-if="!messages.length"
              title="开始一次智能问答"
              description="可以询问课程知识点、备课思路、作业讲解或让助手总结上传资料。"
            />
            <article
              v-for="message in messages"
              :key="message.local_id || message.id"
              :class="['chat-message', message.role === 'user' ? 'chat-message--user' : 'chat-message--assistant']"
            >
              <div class="chat-message__bubble">
                <p v-if="message.role === 'user'">{{ message.content }}</p>
                <MarkdownViewer v-else :content="message.content" :show-toolbar="false" />
                <ReferencePanel v-if="message.role !== 'user' && message.references?.length" :references="message.references" />
                <el-alert v-if="message.role !== 'user' && message.status === 'failed'" :title="message.error_message || '生成中断，请重试'" type="error" show-icon :closable="false" />
                <small v-if="message.role !== 'user' && message.status === 'cancelled'">已停止生成</small>
              </div>
            </article>
          </div>

          <div class="assistant-examples">
            <el-tag
              v-for="example in exampleQuestions"
              :key="example"
              class="assistant-example"
              effect="plain"
              @click="question = example"
            >
              {{ example }}
            </el-tag>
          </div>

          <div class="assistant-composer">
            <el-input
              v-model="question"
              type="textarea"
              :rows="4"
              maxlength="4000"
              show-word-limit
              placeholder="请输入你想咨询的问题，例如：请结合课程知识库解释 FastAPI 的依赖注入。"
              @keydown.ctrl.enter.prevent="sendMessage"
            />
            <div class="assistant-composer__actions">
              <el-button :icon="Delete" :disabled="!messages.length" @click="clearCurrentMessages">清空当前显示</el-button>
              <el-button v-if="sending" type="danger" @click="stopGeneration">停止生成</el-button>
              <el-button v-else type="primary" :icon="Promotion" :disabled="!question.trim()" @click="sendMessage">
                发送
              </el-button>
            </div>
          </div>
        </ContentCard>
      </el-col>

      <el-col :xs="24" :lg="6">
        <ContentCard title="上下文设置" subtitle="不在页面展示内部 ID">
          <el-form label-position="top" class="assistant-context-form">
            <el-form-item label="回答模式">
              <el-segmented v-model="mode" :options="modeOptions" />
            </el-form-item>
            <el-form-item label="课程上下文">
              <el-select
                v-model="selectedCourseId"
                clearable
                filterable
                placeholder="选择我的课程"
                :loading="coursesLoading"
                @change="handleCourseChange"
              >
                <el-option v-for="course in courses" :key="course.id" :label="course.name" :value="course.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="使用课程知识库">
              <el-switch v-model="useCourseKnowledge" :disabled="!selectedCourseId" />
            </el-form-item>
            <el-form-item label="知识库文档">
              <el-select
                v-model="selectedDocumentIds"
                multiple
                collapse-tags
                collapse-tags-tooltip
                placeholder="默认检索全部已入库文档"
                :disabled="!selectedCourseId || !useCourseKnowledge"
                :loading="documentsLoading"
              >
                <el-option
                  v-for="document in ingestedDocuments"
                  :key="document.id"
                  :label="document.title || document.filename || '课程资料'"
                  :value="document.id"
                >
                  <span>{{ document.title || document.filename || '课程资料' }}</span>
                  <el-tag size="small" type="success" effect="plain">{{ document.chunk_count }} chunks</el-tag>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="回答风格">
              <el-select v-model="answerStyle">
                <el-option label="常规说明" value="normal" />
                <el-option label="分步骤" value="step_by_step" />
                <el-option label="简洁回答" value="concise" />
                <el-option label="详细展开" value="detailed" />
              </el-select>
            </el-form-item>
            <el-form-item label="检索片段数">
              <el-slider v-model="topK" :min="1" :max="10" show-stops />
            </el-form-item>
          </el-form>
        </ContentCard>

        <ContentCard class="assistant-side-card" title="本次附件" subtitle="支持 txt / md / pdf / docx">
          <el-upload
            drag
            multiple
            :limit="20"
            :auto-upload="true"
            :show-file-list="false"
            :http-request="uploadAttachment"
            accept=".txt,.md,.pdf,.docx"
          >
            <el-icon><UploadFilled /></el-icon>
            <div class="el-upload__text">拖拽文件或点击上传</div>
          </el-upload>
          <div v-if="attachments.length" class="assistant-attachment-list">
            <el-tag
              v-for="file in attachments"
              :key="file.id"
              closable
              effect="plain"
              @close="removeAttachment(file.id)"
            >
              {{ file.original_filename }}
            </el-tag>
          </div>
          <EmptyState
            v-else
            title="暂无附件"
            description="上传的资料只作为当前助手问答上下文，不会自动进入课程知识库。"
          />
        </ContentCard>
      </el-col>
    </el-row>
  </section>
</template>

<script setup lang="ts">
import { ChatRound, Delete, Plus, Promotion, Refresh, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, type PropType } from 'vue'

import {
  createAssistantSession,
  deleteAssistantSession,
  getAssistantSession,
  listAssistantSessions,
  streamAssistantMessage,
  cancelAssistantMessage,
  uploadAssistantFile
} from '@/api/assistant'
import { getMyCourses } from '@/api/courses'
import { listCourseKnowledgeDocuments } from '@/api/courseKnowledge'
import { getLLMStatus } from '@/api/llm'
import ContentCard from '@/components/common/ContentCard.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue'
import type {
  AssistantAnswerStyle,
  AssistantFile,
  AssistantMessage,
  AssistantMode,
  AssistantReference,
  AssistantSessionSummary
} from '@/types/assistant'
import type { Course } from '@/types/course'
import type { CourseKnowledgeDocument } from '@/types/courseKnowledge'
import type { LLMStatus } from '@/types/llm'
import { formatDateTime } from '@/utils/format'

interface LocalMessage extends AssistantMessage {
  local_id?: string
}

const ReferencePanel = defineComponent({
  name: 'AssistantReferencePanel',
  props: {
    references: {
      type: Array as PropType<AssistantReference[]>,
      required: true
    }
  },
  setup(props) {
    return () =>
      h('div', { class: 'reference-list assistant-reference-list' }, [
        h('h3', '引用来源'),
        ...props.references.map((reference, index) =>
          h('article', { class: 'reference-card', key: `${reference.title || reference.filename || index}-${index}` }, [
            h('span', reference.source_type === 'file' ? '本次附件' : '课程知识库'),
            h('strong', reference.title || reference.filename || '资料片段'),
            h('p', reference.excerpt),
            reference.score !== null && reference.score !== undefined
              ? h('small', `匹配度 ${Number(reference.score).toFixed(4)}`)
              : null
          ])
        )
      ])
  }
})

const modeOptions = [
  { label: '通用', value: 'general' },
  { label: '课程问答', value: 'course_qa' },
  { label: '附件问答', value: 'file_qa' }
]

const exampleQuestions = [
  '请结合课程知识库解释这个知识点。',
  '请把这份资料总结成课堂讲解提纲。',
  '请生成 3 个检查理解程度的问题。'
]

const sessions = ref<AssistantSessionSummary[]>([])
const messages = ref<LocalMessage[]>([])
const courses = ref<Course[]>([])
const documents = ref<CourseKnowledgeDocument[]>([])
const attachments = ref<AssistantFile[]>([])
const currentSessionId = ref<number | null>(null)
const selectedCourseId = ref<number | null>(null)
const selectedDocumentIds = ref<number[]>([])
const mode = ref<AssistantMode>('course_qa')
const answerStyle = ref<AssistantAnswerStyle>('normal')
const topK = ref(5)
const useCourseKnowledge = ref(true)
const question = ref('')
const sessionsLoading = ref(false)
const coursesLoading = ref(false)
const documentsLoading = ref(false)
const llmStatus = ref<LLMStatus | null>(null)
const llmStatusLoading = ref(false)
const sending = ref(false)
let streamController: AbortController | null = null
let runningAssistantMessageId: number | null = null
const threadRef = ref<HTMLElement | null>(null)

const ingestedDocuments = computed(() => documents.value.filter((document) => document.status === 'ingested'))

function modeLabel(value?: string) {
  if (value === 'course_qa') return '课程问答'
  if (value === 'file_qa') return '附件问答'
  return '通用'
}

async function loadSessions() {
  sessionsLoading.value = true
  try {
    const data = await listAssistantSessions({ page: 1, page_size: 30 })
    sessions.value = data.items
  } finally {
    sessionsLoading.value = false
  }
}

async function loadCourses() {
  coursesLoading.value = true
  try {
    const data = await getMyCourses({ page: 1, page_size: 100 })
    courses.value = data.items
  } finally {
    coursesLoading.value = false
  }
}

async function loadLLMStatus() {
  llmStatusLoading.value = true
  try {
    llmStatus.value = await getLLMStatus()
  } catch {
    llmStatus.value = null
  } finally {
    llmStatusLoading.value = false
  }
}

async function loadDocuments(courseId: number | null) {
  documents.value = []
  selectedDocumentIds.value = []
  if (!courseId) return
  documentsLoading.value = true
  try {
    const data = await listCourseKnowledgeDocuments(courseId, { page: 1, page_size: 100 })
    documents.value = data.items
  } finally {
    documentsLoading.value = false
  }
}

async function handleCourseChange() {
  await loadDocuments(selectedCourseId.value)
  if (selectedCourseId.value && mode.value === 'general') mode.value = 'course_qa'
}

async function selectSession(sessionId: number) {
  const detail = await getAssistantSession(sessionId)
  currentSessionId.value = detail.id
  selectedCourseId.value = detail.course_id || null
  mode.value = (detail.mode as AssistantMode) || 'general'
  messages.value = detail.messages
  await loadDocuments(selectedCourseId.value)
  scrollToBottom()
}

function startNewSession() {
  currentSessionId.value = null
  messages.value = []
  question.value = ''
  attachments.value = []
}

async function clearCurrentMessages() {
  if (!messages.value.length) return
  await ElMessageBox.confirm('只清空当前页面显示，不删除服务端会话历史。', '清空当前显示', {
    type: 'warning',
    confirmButtonText: '清空',
    cancelButtonText: '取消'
  })
  messages.value = []
}

async function ensureSession() {
  if (currentSessionId.value) return currentSessionId.value
  const session = await createAssistantSession({
    course_id: selectedCourseId.value,
    mode: mode.value,
    title: question.value.trim().slice(0, 48) || '智能助手会话'
  })
  currentSessionId.value = session.id
  sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)]
  return session.id
}

async function sendMessage() {
  const text = question.value.trim()
  if (!text || sending.value) return
  sending.value = true
  const pendingUserMessage: LocalMessage = {
    id: 0,
    local_id: `local-user-${Date.now()}`,
    session_id: currentSessionId.value || 0,
    role: 'user',
    content: text,
    references: [],
    attachment_file_ids: attachments.value.map((file) => file.id),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  const pendingAssistantMessage: LocalMessage = {
    id: 0,
    local_id: `local-assistant-${Date.now()}`,
    session_id: currentSessionId.value || 0,
    role: 'assistant',
    content: '',
    status: 'running',
    references: [],
    attachment_file_ids: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  messages.value.push(pendingUserMessage, pendingAssistantMessage)
  question.value = ''
  await scrollToBottom()
  try {
    const sessionId = await ensureSession()
    streamController = new AbortController()
    await streamAssistantMessage(sessionId, {
      message: text,
      course_id: selectedCourseId.value,
      use_course_knowledge: useCourseKnowledge.value,
      knowledge_document_ids: selectedDocumentIds.value,
      attachment_file_ids: attachments.value.map((file) => file.id),
      answer_style: answerStyle.value,
      top_k: topK.value
    }, streamController.signal, (event) => {
      if (event.type === 'meta') {
        Object.assign(pendingUserMessage, event.user_message, { local_id: undefined })
        Object.assign(pendingAssistantMessage, event.assistant_message, { local_id: undefined })
        runningAssistantMessageId = event.assistant_message.id
        if (event.warnings.length) ElMessage.warning(event.warnings[0])
      } else if (event.type === 'delta') {
        pendingAssistantMessage.content += event.text
      } else if (event.type === 'references') {
        pendingAssistantMessage.references = event.references
      } else if (event.type === 'warning') {
        ElMessage.warning(event.message)
      } else if (event.type === 'done') {
        Object.assign(pendingAssistantMessage, event.message, { references: event.references })
      } else if (event.type === 'error') {
        pendingAssistantMessage.status = 'failed'
        pendingAssistantMessage.error_message = event.message
      }
      void scrollToBottom()
    })
    await loadSessions()
  } catch (error) {
    if (!streamController?.signal.aborted) {
      pendingAssistantMessage.status = 'failed'
      pendingAssistantMessage.error_message = error instanceof Error ? error.message : '生成中断，请重试'
    }
  } finally {
    sending.value = false
    streamController = null
    runningAssistantMessageId = null
  }
}

async function stopGeneration() {
  const messageId = runningAssistantMessageId
  streamController?.abort()
  if (messageId) await cancelAssistantMessage(messageId)
  const running = messages.value.find((item) => item.id === messageId || item.status === 'running')
  if (running) running.status = 'cancelled'
  sending.value = false
}

async function uploadAttachment(options: UploadRequestOptions) {
  const formData = new FormData()
  formData.append('file', options.file)
  const file = await uploadAssistantFile(formData, (event) => {
    if (event.total) options.onProgress({ percent: Math.round((event.loaded / event.total) * 100) } as ProgressEvent & { percent: number })
  })
  attachments.value.push(file)
  if (mode.value === 'general') mode.value = 'file_qa'
  ElMessage.success('附件已加入当前问答上下文')
  options.onSuccess(file)
}

function removeAttachment(fileId: number) {
  attachments.value = attachments.value.filter((file) => file.id !== fileId)
}

async function scrollToBottom() {
  await nextTick()
  if (!threadRef.value) return
  threadRef.value.scrollTop = threadRef.value.scrollHeight
}

onMounted(async () => {
  await Promise.all([loadSessions(), loadCourses(), loadLLMStatus()])
  if (courses.value.length) {
    selectedCourseId.value = courses.value[0].id
    await loadDocuments(selectedCourseId.value)
  }
})

onBeforeUnmount(() => {
  streamController?.abort()
})
</script>
