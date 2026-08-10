<template>
  <div class="account-page">
    <section class="account-hero">
      <div class="account-avatar">{{ avatarText }}</div>
      <div>
        <p class="account-eyebrow">PERSONAL ACCOUNT</p>
        <h1>{{ profile?.full_name || profile?.username || '个人中心' }}</h1>
        <p>查看账号基本信息，修改显示姓名或重新设置登录密码。</p>
      </div>
      <el-tag class="role-tag" effect="plain">{{ roleLabel }}</el-tag>
    </section>

    <div class="account-grid" v-loading="loading">
      <el-card class="account-card info-card" shadow="never">
        <template #header>
          <div class="card-heading">
            <div>
              <strong>基本信息</strong>
              <span>账号身份与登录记录</span>
            </div>
            <el-button text :loading="loading" @click="loadProfile">刷新</el-button>
          </div>
        </template>

        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户 ID">{{ profile?.id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="用户名">{{ profile?.username || '-' }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ profile?.email || '-' }}</el-descriptions-item>
          <el-descriptions-item label="账号角色">{{ roleLabel }}</el-descriptions-item>
          <el-descriptions-item label="账号状态">{{ profile?.is_active ? '正常' : '已停用' }}</el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ formatDateTime(profile?.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="最近登录">{{ formatDateTime(profile?.last_login_at) }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <div class="account-actions">
        <el-card class="account-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <strong>修改姓名</strong>
                <span>用于页面展示，不会改变登录用户名</span>
              </div>
            </div>
          </template>
          <el-form ref="profileFormRef" :model="profileForm" :rules="profileRules" label-position="top">
            <el-form-item label="姓名或显示名称" prop="full_name">
              <el-input v-model="profileForm.full_name" maxlength="120" show-word-limit placeholder="请输入姓名" />
            </el-form-item>
            <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存修改</el-button>
          </el-form>
        </el-card>

        <el-card class="account-card password-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <strong>重新设置密码</strong>
                <span>修改成功后需要使用新密码重新登录</span>
              </div>
            </div>
          </template>
          <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-position="top">
            <el-form-item label="当前密码" prop="current_password">
              <el-input v-model="passwordForm.current_password" type="password" show-password autocomplete="current-password" />
            </el-form-item>
            <el-form-item label="新密码" prop="new_password">
              <el-input v-model="passwordForm.new_password" type="password" show-password autocomplete="new-password" />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirm_password">
              <el-input v-model="passwordForm.confirm_password" type="password" show-password autocomplete="new-password" />
            </el-form-item>
            <el-button type="primary" :loading="savingPassword" @click="savePassword">更新密码</el-button>
          </el-form>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { changeMyPassword, getMyProfile, updateMyProfile, userRoleLabels, type AdminUser } from '@/api/users'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/format'

const router = useRouter()
const auth = useAuthStore()
const profile = ref<AdminUser | null>(null)
const loading = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)
const profileFormRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()

const profileForm = reactive({ full_name: '' })
const passwordForm = reactive({ current_password: '', new_password: '', confirm_password: '' })

const roleLabel = computed(() => profile.value ? userRoleLabels[profile.value.role] : '用户')
const avatarText = computed(() => (profile.value?.full_name || profile.value?.username || 'U').slice(0, 1).toUpperCase())

const profileRules: FormRules = {
  full_name: [
    { required: true, message: '请输入姓名或显示名称', trigger: 'blur' },
    { min: 1, max: 120, message: '姓名长度不能超过 120 个字符', trigger: 'blur' }
  ]
}

const passwordRules: FormRules = {
  current_password: [{ required: true, min: 8, max: 72, message: '请输入当前密码', trigger: 'blur' }],
  new_password: [{ required: true, min: 8, max: 72, message: '新密码需为 8-72 个字符', trigger: 'blur' }],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.new_password) callback(new Error('两次输入的新密码不一致'))
        else callback()
      },
      trigger: ['blur', 'change']
    }
  ]
}

async function loadProfile() {
  loading.value = true
  try {
    profile.value = await getMyProfile()
    profileForm.full_name = profile.value.full_name || ''
    auth.updateStoredUser(profile.value)
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  await profileFormRef.value?.validate()
  savingProfile.value = true
  try {
    const updated = await updateMyProfile({ full_name: profileForm.full_name.trim() })
    profile.value = updated
    profileForm.full_name = updated.full_name || ''
    auth.updateStoredUser(updated)
    ElMessage.success('姓名已更新')
  } finally {
    savingProfile.value = false
  }
}

async function savePassword() {
  await passwordFormRef.value?.validate()
  if (passwordForm.current_password === passwordForm.new_password) {
    ElMessage.warning('新密码不能与当前密码相同')
    return
  }
  savingPassword.value = true
  try {
    await changeMyPassword(passwordForm)
    ElMessage.success('密码修改成功，请使用新密码重新登录')
    await auth.logout()
    router.replace('/auth/login')
  } finally {
    savingPassword.value = false
  }
}

onMounted(loadProfile)
</script>

<style scoped>
.account-page {
  min-height: 100%;
  padding: 28px;
  color: #173942;
  background:
    radial-gradient(circle at 88% 8%, rgba(93, 190, 198, 0.16), transparent 28%),
    linear-gradient(145deg, #f7f5ee, #eef5f2);
}

.account-hero {
  display: flex;
  align-items: center;
  gap: 20px;
  max-width: 1180px;
  margin: 0 auto 22px;
  padding: 24px 28px;
  border: 1px solid rgba(58, 111, 119, 0.2);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 18px 45px rgba(28, 72, 78, 0.08);
}

.account-avatar {
  display: grid;
  width: 68px;
  height: 68px;
  flex: 0 0 68px;
  place-items: center;
  border-radius: 20px;
  color: white;
  font-size: 28px;
  font-weight: 800;
  background: linear-gradient(145deg, #246a76, #63b5b6);
  box-shadow: 0 12px 28px rgba(36, 106, 118, 0.22);
}

.account-eyebrow {
  margin: 0 0 4px;
  color: #699098;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.account-hero h1 { margin: 0; font-size: clamp(26px, 3vw, 38px); }
.account-hero p:last-child { margin: 7px 0 0; color: #6d898f; }
.role-tag { margin-left: auto; }

.account-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 1.1fr);
  gap: 22px;
  max-width: 1180px;
  margin: 0 auto;
}

.account-actions { display: grid; gap: 22px; }
.account-card { border: 1px solid rgba(58, 111, 119, 0.17); border-radius: 18px; }
.card-heading { display: flex; align-items: center; justify-content: space-between; }
.card-heading strong { display: block; font-size: 18px; }
.card-heading span { display: block; margin-top: 4px; color: #769098; font-size: 13px; }
.account-card :deep(.el-button--primary) { min-width: 130px; background: #347d87; border-color: #347d87; }

@media (max-width: 900px) {
  .account-page { padding: 16px; }
  .account-grid { grid-template-columns: 1fr; }
  .account-hero { align-items: flex-start; padding: 20px; }
  .role-tag { margin-left: 0; }
}

@media (max-width: 560px) {
  .account-hero { flex-wrap: wrap; }
  .account-avatar { width: 56px; height: 56px; flex-basis: 56px; }
}
</style>
