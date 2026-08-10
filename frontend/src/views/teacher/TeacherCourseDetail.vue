<template>
  <section class="course-detail-page">
    <PageHeader
      eyebrow="课程详情"
      :title="course?.name || '课程详情'"
      :description="course?.description || '查看课程概览和成员情况。'"
      :icon="Collection"
    >
      <template #actions>
        <el-button @click="router.push('/teacher/courses')">返回我的课程</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="loadAll">刷新</el-button>
      </template>
    </PageHeader>

    <LoadingState v-if="loading && !course" />
    <ContentCard v-else-if="course" title="课程工作台" :subtitle="`加入码：${course.code}`">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="概览" name="overview">
          <div class="course-overview">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="课程名称">{{ course.name }}</el-descriptions-item>
              <el-descriptions-item label="课程状态">
                <el-tag :type="course.status === 'active' ? 'success' : 'info'">
                  {{ course.status === 'active' ? '进行中' : '已归档' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="加入码">{{ course.code }}</el-descriptions-item>
              <el-descriptions-item label="学生人数">{{ course.student_count }}</el-descriptions-item>
              <el-descriptions-item label="教师">{{ course.teacher_name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDateTime(course.created_at) }}</el-descriptions-item>
              <el-descriptions-item label="课程详情介绍" :span="2">
                <div class="course-description-editor">
                  <el-input
                    v-model="courseDescription"
                    type="textarea"
                    :rows="6"
                    maxlength="2000"
                    show-word-limit
                    placeholder="请填写课程定位、授课对象、教学目标、主要内容、考核方式等课程详情。"
                  />
                  <el-button type="primary" :loading="descriptionSaving" @click="saveCourseDescription">
                    保存课程详情
                  </el-button>
                </div>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </el-tab-pane>

        <el-tab-pane label="学生成员" name="members">
          <div class="table-toolbar">
            <span>共 {{ memberTotal }} 名成员</span>
            <el-button :loading="membersLoading" @click="loadMembers">刷新成员</el-button>
          </div>
          <EmptyState v-if="!membersLoading && !members.length" title="暂无成员" description="学生通过加入码加入后会显示在这里。" />
          <el-table v-else v-loading="membersLoading" :data="members" row-key="id">
            <el-table-column prop="user_id" label="用户 ID" width="100" />
            <el-table-column prop="username" label="用户名" min-width="150" />
            <el-table-column prop="email" label="邮箱" min-width="220" show-overflow-tooltip />
            <el-table-column label="角色" width="120">
              <template #default="{ row }">
                <el-tag :type="row.role === 'teacher' ? 'warning' : 'success'">{{ row.role === 'teacher' ? '教师' : '学生' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '有效' : '已移除' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="加入时间" width="190">
              <template #default="{ row }">{{ formatDateTime(row.joined_at) }}</template>
            </el-table-column>
            <el-table-column label="学生画像（实时）" min-width="430">
              <template #default="{ row }">
                <div v-if="row.role === 'student' && row.profile" class="member-profile">
                  <div class="member-profile__scores">
                    <el-tag v-for="item in profileScores(row.profile)" :key="item.label" size="small" effect="plain">
                      {{ item.label }} {{ formatProfileScore(item.value) }}
                    </el-tag>
                  </div>
                  <small>薄弱点：{{ row.profile.weaknesses?.join('、') || '未记录' }}</small>
                  <small>画像更新：{{ formatDateTime(row.profile.updated_at) }}</small>
                </div>
                <span v-else-if="row.role === 'student'">尚未建立画像</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-pagination">
            <el-pagination
              v-model:current-page="memberPagination.page"
              v-model:page-size="memberPagination.page_size"
              background
              layout="total, prev, pager, next"
              :total="memberTotal"
              @current-change="loadMembers"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="知识库" name="knowledge">
          <CourseKnowledgeTab :course-id="course.id" />
        </el-tab-pane>
        <el-tab-pane label="智能出题" name="questions">
          <CourseAssignmentsTab :course-id="course.id" />
        </el-tab-pane>
      </el-tabs>
    </ContentCard>
    <EmptyState v-else title="课程不存在" description="请返回课程列表重新选择课程。" />
  </section>
</template>

<script setup lang="ts">
import { Collection, Refresh } from '@element-plus/icons-vue'
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getCourse, getCourseMembers, updateCourse } from '@/api/courses'
import { ElMessage } from 'element-plus'
import ContentCard from '@/components/common/ContentCard.vue'
import CourseAssignmentsTab from '@/components/courses/CourseAssignmentsTab.vue'
import CourseKnowledgeTab from '@/components/courses/CourseKnowledgeTab.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import type { Course, CourseMember, CourseMemberProfileSnapshot } from '@/types/course'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const course = ref<Course | null>(null)
const members = ref<CourseMember[]>([])
const memberTotal = ref(0)
const loading = ref(false)
const membersLoading = ref(false)
const descriptionSaving = ref(false)
const courseDescription = ref('')
const activeTab = ref('overview')
const memberPagination = reactive({ page: 1, page_size: 20 })
let memberRefreshTimer: number | undefined

const courseId = () => String(route.params.id)

async function loadCourse() {
  course.value = await getCourse(courseId())
  courseDescription.value = course.value.description || ''
}

async function saveCourseDescription() {
  if (!course.value) return
  descriptionSaving.value = true
  try {
    course.value = await updateCourse(course.value.id, {
      description: courseDescription.value.trim() || null
    })
    courseDescription.value = course.value.description || ''
    ElMessage.success('课程详情已保存。')
  } finally {
    descriptionSaving.value = false
  }
}

async function loadMembers() {
  membersLoading.value = true
  try {
    const data = await getCourseMembers(courseId(), {
      page: memberPagination.page,
      page_size: memberPagination.page_size
    })
    members.value = data.items
    memberTotal.value = data.total
  } finally {
    membersLoading.value = false
  }
}

async function loadAll() {
  loading.value = true
  try {
    await loadCourse()
    await loadMembers()
  } finally {
    loading.value = false
  }
}

function profileScores(profile: CourseMemberProfileSnapshot) {
  return [
    { label: '知', value: profile.knowledge_score },
    { label: '践', value: profile.practice_score },
    { label: '创', value: profile.innovation_score },
    { label: '测', value: profile.exam_score },
    { label: '效', value: profile.efficiency_score },
    { label: '质', value: profile.quality_score }
  ]
}

function formatProfileScore(value: number) {
  return Number(value || 0).toFixed(Number.isInteger(Number(value || 0)) ? 0 : 1)
}

function syncMemberRefreshTimer(tab: string) {
  if (memberRefreshTimer) window.clearInterval(memberRefreshTimer)
  memberRefreshTimer = undefined
  if (tab === 'members') {
    void loadMembers()
    memberRefreshTimer = window.setInterval(() => {
      if (!membersLoading.value) void loadMembers()
    }, 10_000)
  }
}

watch(activeTab, syncMemberRefreshTimer)
onMounted(loadAll)
onBeforeUnmount(() => {
  if (memberRefreshTimer) window.clearInterval(memberRefreshTimer)
})
</script>

<style scoped>
.course-detail-page {
  display: grid;
  gap: 20px;
}

.course-overview {
  padding-top: 8px;
}

.course-description-editor {
  display: grid;
  justify-items: end;
  gap: 10px;
  width: 100%;
}

.member-profile,
.member-profile__scores {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.member-profile {
  flex-direction: column;
}

.member-profile small {
  color: var(--el-text-color-secondary);
}
</style>
