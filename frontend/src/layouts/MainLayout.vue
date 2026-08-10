<template>
  <el-container class="main-layout" data-testid="legacy-main-layout">
    <el-aside class="main-layout__aside" :width="app.sidebarCollapsed ? '72px' : '248px'">
      <RouterLink class="main-layout__brand" :to="brandPath">
        <AppLogo />
      </RouterLink>
      <el-menu :default-active="route.path" router class="side-menu" :collapse="app.sidebarCollapsed">
        <el-menu-item v-for="item in menuItems" :key="item.key" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="main-layout__header">
        <el-tooltip :content="app.sidebarCollapsed ? '展开侧边栏' : '折叠菜单'" placement="bottom">
          <button class="icon-action" type="button" @click="app.toggleSidebar">
            <el-icon><Fold v-if="!app.sidebarCollapsed" /><Expand v-else /></el-icon>
          </button>
        </el-tooltip>
        <div class="header-title">
          <strong>{{ route.meta.title || '工作台' }}</strong>
          <span>{{ subtitle }}</span>
        </div>
        <div class="header-actions">
          <el-tooltip content="切换深色模式" placement="bottom">
            <button class="icon-action" type="button" @click="app.toggleDarkMode">
              <el-icon><Moon /></el-icon>
            </button>
          </el-tooltip>
          <UserMenu />
        </div>
      </el-header>
      <el-main class="main-layout__content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import {
  ChatRound,
  Collection,
  DataAnalysis,
  Document,
  EditPen,
  Expand,
  Files,
  Fold,
  House,
  MagicStick,
  Moon,
  Notebook,
  Operation,
  Tickets,
  User
} from '@element-plus/icons-vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppLogo from '@/components/common/AppLogo.vue'
import UserMenu from '@/components/layout/UserMenu.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { roleHomePath } from '@/utils/auth'

const props = defineProps<{
  mode?: 'teacher' | 'student' | 'admin'
}>()

const route = useRoute()
const app = useAppStore()
const auth = useAuthStore()
const effectiveMode = computed(() => props.mode || auth.role || 'admin')

const subtitle = computed(() => {
  if (effectiveMode.value === 'teacher') return '教师资源生成、文件中心、知识库与生成历史'
  if (effectiveMode.value === 'student') return '学生画像、RAG 辅导、学习资源、路径、测评闭环'
  return '系统概览、用户管理与师生工作台入口'
})

const brandPath = computed(() => roleHomePath(auth.role))

const menuItems = computed(() => {
  if (effectiveMode.value === 'teacher') {
    const items = [
      { key: 'teacher-dashboard', path: '/teacher/dashboard', label: '教师首页', icon: House },
      { key: 'teacher-courses', path: '/teacher/courses', label: '我的课程', icon: Collection },
      { key: 'teacher-training', path: '/teacher/training-plans', label: '培养方案', icon: Notebook },
      { key: 'teacher-course', path: '/teacher/course-designs', label: '课程设计', icon: Document },
      { key: 'teacher-teaching', path: '/teacher/teaching-designs', label: '教学设计', icon: EditPen },
      { key: 'teacher-exercises', path: '/teacher/exercises', label: '练习题', icon: Tickets },
      { key: 'teacher-papers', path: '/teacher/papers', label: '试卷生成', icon: Files },
      { key: 'teacher-projects', path: '/teacher/projects', label: '项目实践', icon: MagicStick },
      { key: 'teacher-files', path: '/teacher/files', label: '文件中心', icon: Files },
      { key: 'teacher-knowledge', path: '/teacher/knowledge', label: '知识库', icon: Collection },
      { key: 'teacher-history', path: '/teacher/artifacts', label: '生成历史', icon: Collection },
      { key: 'assistant', path: '/assistant', label: '智能助手', icon: ChatRound },
      { key: 'tasks', path: '/tasks', label: '任务中心', icon: Operation }
    ]
    const hiddenKeys = new Set([
      'teacher-teaching',
      'teacher-projects',
      'tasks',
      ...(route.meta.hiddenMenuKeys || [])
    ])
    return items.filter((item) => !hiddenKeys.has(item.key))
  }
  if (effectiveMode.value === 'student') {
    return [
      { key: 'student-dashboard', path: '/student/dashboard', label: '学生首页', icon: House },
      { key: 'student-courses', path: '/student/courses', label: '我的课程', icon: Notebook },
      { key: 'student-profile', path: '/student/profile', label: '学习画像', icon: User },
      { key: 'student-tutoring', path: '/student/tutoring', label: 'RAG 辅导', icon: MagicStick },
      { key: 'student-resources', path: '/student/resources', label: '学习资源', icon: Document },
      { key: 'student-exercises', path: '/student/exercises', label: '我的练习', icon: EditPen },
      { key: 'student-paths', path: '/student/learning-paths', label: '学习路径', icon: DataAnalysis },
      { key: 'student-assessments', path: '/student/assessments', label: '学习评估', icon: DataAnalysis },
      { key: 'student-tests', path: '/student/tests', label: '学生测试', icon: Tickets },
      { key: 'assistant', path: '/assistant', label: '智能助手', icon: ChatRound },
      { key: 'tasks', path: '/tasks', label: '任务中心', icon: Operation }
    ]
  }
  return [
    { key: 'admin-dashboard', path: '/admin/dashboard', label: '系统概览', icon: House },
    { key: 'admin-users', path: '/admin/users', label: '用户管理', icon: User },
    { key: 'assistant', path: '/assistant', label: '智能助手', icon: ChatRound },
    { key: 'tasks', path: '/tasks', label: '任务中心', icon: Operation },
    { key: 'admin-teacher', path: '/teacher/dashboard', label: '教师工作台', icon: Collection },
    { key: 'admin-student', path: '/student/dashboard', label: '学生工作台', icon: DataAnalysis },
    { key: 'admin-knowledge', path: '/teacher/knowledge', label: '知识库管理', icon: Collection },
    { key: 'admin-artifacts', path: '/teacher/artifacts', label: '生成历史', icon: Files },
    { key: 'admin-tests', path: '/student/tests', label: '学生测试', icon: Tickets },
    { key: 'admin-assessments', path: '/student/assessments', label: '学习评估', icon: DataAnalysis }
  ]
})
</script>
