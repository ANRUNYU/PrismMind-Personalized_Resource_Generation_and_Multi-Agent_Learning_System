<template>
  <el-card shadow="never" class="learning-path-form-card">
    <template #header>
      <div class="panel-header">
        <strong>创建学习路径</strong>
        <span>结合画像的阶段性计划</span>
      </div>
    </template>

    <el-form label-position="top">
      <el-form-item label="标题">
        <el-input v-model="form.title" placeholder="可选路径标题" />
      </el-form-item>
      <el-form-item label="主题" required>
        <el-input v-model="form.topic" placeholder="例如：机器学习基础" />
      </el-form-item>
      <el-form-item label="目标" required>
        <el-input v-model="form.target_goal" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item label="知识点">
        <el-input v-model="knowledgePointsText" type="textarea" :rows="3" placeholder="每行一个，或用逗号分隔" />
      </el-form-item>

      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="持续天数">
            <el-input-number v-model="form.duration_days" :min="1" :max="90" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="每日分钟">
            <el-input-number v-model="form.daily_minutes" :min="10" :max="480" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="难度">
        <el-select v-model="form.difficulty" class="full-width">
          <el-option label="基础" value="easy" />
          <el-option label="常规" value="normal" />
          <el-option label="困难" value="hard" />
        </el-select>
      </el-form-item>

      <el-collapse class="advanced-panel">
        <el-collapse-item title="高级规划" name="advanced">
          <el-form-item label="课程关联">
            <el-alert
              type="info"
              :closable="false"
              title="使用系统默认课程上下文，无需填写课程编号。"
            />
          </el-form-item>
          <el-form-item label="关联已有资源">
            <el-select
              v-model="form.resource_ids"
              :loading="resourcesStore.loading"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              class="full-width"
              placeholder="按资源标题选择，可留空"
            >
              <el-option
                v-for="resource in resourceOptions"
                :key="resource.id"
                :label="resource.title"
                :value="resource.id"
              >
                <div class="entity-option">
                  <strong>{{ resource.title }}</strong>
                  <span>{{ labelResourceType(resource.resource_type) }} · {{ resource.difficulty_level || '未标注难度' }}</span>
                </div>
              </el-option>
            </el-select>
            <div v-if="!resourcesStore.loading && !resourceOptions.length" class="entity-empty">
              暂无可关联资源，也可以直接按主题创建路径。
            </div>
          </el-form-item>
          <el-row :gutter="12">
            <el-col :xs="24" :sm="12">
              <el-form-item label="使用画像">
                <el-switch v-model="form.use_profile" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12">
              <el-form-item label="使用已有资源">
                <el-switch v-model="form.use_existing_resources" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="补充要求">
            <el-input v-model="form.additional_requirements" type="textarea" :rows="3" />
          </el-form-item>
        </el-collapse-item>
      </el-collapse>

      <el-button type="primary" class="full-width" :loading="loading" @click="submit">创建路径</el-button>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onMounted, reactive, ref } from 'vue'

import type { LearningPathCreateRequest } from '@/api/learningPaths'
import { resourceTypeLabels } from '@/api/resources'
import { useResourcesStore } from '@/stores/resources'

defineProps<{
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: LearningPathCreateRequest]
}>()

const resourcesStore = useResourcesStore()
const knowledgePointsText = ref('')
const resourceOptions = computed(() => resourcesStore.resources.slice(0, 50))
const form = reactive<LearningPathCreateRequest>({
  title: '',
  topic: '',
  course_id: null,
  target_goal: '',
  knowledge_points: [],
  duration_days: 14,
  daily_minutes: 60,
  difficulty: 'normal',
  resource_ids: [],
  use_profile: true,
  use_existing_resources: true,
  additional_requirements: ''
})

function splitText(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function labelResourceType(value: string) {
  return resourceTypeLabels[value as keyof typeof resourceTypeLabels] || value
}

function submit() {
  if (!form.topic.trim()) {
    ElMessage.warning('请输入路径主题。')
    return
  }
  if (!form.target_goal.trim()) {
    ElMessage.warning('请描述目标。')
    return
  }
  emit('submit', {
    ...form,
    title: form.title?.trim() || null,
    topic: form.topic.trim(),
    target_goal: form.target_goal.trim(),
    course_id: null,
    knowledge_points: splitText(knowledgePointsText.value),
    resource_ids: form.resource_ids?.length ? form.resource_ids : null,
    additional_requirements: form.additional_requirements?.trim() || null
  })
}

onMounted(() => {
  resourcesStore.fetchResources({ page: 1, page_size: 50 })
})
</script>

<style scoped>
.entity-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.entity-option span,
.entity-empty {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.entity-empty {
  margin-top: 8px;
}
</style>
