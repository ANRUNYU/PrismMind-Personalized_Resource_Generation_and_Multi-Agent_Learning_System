<template>
  <section class="course-detail-page">
    <PageHeader
      eyebrow="课程学习"
      :title="course?.name || '课程学习'"
      :description="course?.description || '从课程空间进入个性化学习流程。'"
      :icon="Reading"
    >
      <template #actions>
        <el-button @click="router.push('/student/courses')">返回我的课程</el-button>
        <el-button type="primary" @click="router.push('/student/resources')">生成学习资源</el-button>
      </template>
    </PageHeader>

    <LoadingState v-if="loading && !course" />
    <ContentCard v-else-if="course" title="课程学习空间" :subtitle="`课程码：${course.code}`">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="课程概览" name="overview">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="课程名称">{{ course.name }}</el-descriptions-item>
            <el-descriptions-item label="课程状态">
              <el-tag :type="course.status === 'active' ? 'success' : 'info'">
                {{ course.status === 'active' ? '进行中' : '已归档' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="教师">{{ course.teacher_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="学生人数">{{ course.student_count }}</el-descriptions-item>
            <el-descriptions-item label="最近更新">{{ formatDateTime(course.updated_at) }}</el-descriptions-item>
            <el-descriptions-item label="我的角色">{{ course.current_user_role === 'student' ? '学生' : course.current_user_role }}</el-descriptions-item>
            <el-descriptions-item label="课程简介" :span="2">
              {{ course.description || '暂未填写课程简介。' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>
        <el-tab-pane label="课程资源/知识库" name="resources">
          <StudentCourseKnowledgeTab :course-id="course.id" />
          <div class="tab-action">
            <el-button type="primary" @click="router.push('/student/resources')">打开学习资源</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane label="学习路径" name="paths">
          <EmptyState title="可使用现有学习路径" description="课程维度学习路径聚合将在后续阶段完善，当前可先使用学生学习路径页面。" />
          <div class="tab-action">
            <el-button type="primary" @click="router.push('/student/learning-paths')">打开学习路径</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane label="作业/测试" name="tests">
          <StudentCourseAssignmentsTab :course-id="course.id" />
        </el-tab-pane>
      </el-tabs>
    </ContentCard>
    <EmptyState v-else title="课程不可访问" description="请确认你已经加入该课程。" />
  </section>
</template>

<script setup lang="ts">
import { Reading } from '@element-plus/icons-vue'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getCourse } from '@/api/courses'
import ContentCard from '@/components/common/ContentCard.vue'
import StudentCourseKnowledgeTab from '@/components/courses/StudentCourseKnowledgeTab.vue'
import StudentCourseAssignmentsTab from '@/components/courses/StudentCourseAssignmentsTab.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import type { Course } from '@/types/course'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const course = ref<Course | null>(null)
const loading = ref(false)
const activeTab = ref('overview')

async function loadCourse() {
  loading.value = true
  try {
    course.value = await getCourse(String(route.params.id))
  } finally {
    loading.value = false
  }
}

onMounted(loadCourse)
</script>

<style scoped>
.course-detail-page {
  display: grid;
  gap: 20px;
}

.tab-action {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}
</style>
