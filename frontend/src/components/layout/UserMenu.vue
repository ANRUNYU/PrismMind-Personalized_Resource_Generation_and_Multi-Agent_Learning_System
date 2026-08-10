<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <button class="user-menu" type="button">
      <el-avatar :size="32">{{ initials }}</el-avatar>
      <span class="user-menu__meta">
        <span class="user-menu__name">{{ auth.user?.full_name || auth.user?.username }}</span>
        <span class="user-menu__role">{{ roleLabel }}</span>
      </span>
      <el-icon><ArrowDown /></el-icon>
    </button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item disabled>{{ roleLabel }}</el-dropdown-item>
        <el-dropdown-item command="profile">个人中心</el-dropdown-item>
        <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { ArrowDown } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const initials = computed(() => (auth.user?.username || 'U').slice(0, 1).toUpperCase())
const roleLabel = computed(() => {
  if (auth.role === 'teacher') return '教师'
  if (auth.role === 'student') return '学生'
  if (auth.role === 'admin') return '管理员'
  return '访客'
})

async function handleCommand(command: string) {
  if (command === 'profile') {
    router.push('/account')
    return
  }
  if (command === 'logout') {
    await auth.logout()
    router.replace('/auth/login')
  }
}
</script>
