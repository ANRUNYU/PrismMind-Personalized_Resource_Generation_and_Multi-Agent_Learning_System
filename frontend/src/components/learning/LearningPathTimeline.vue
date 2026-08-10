<template>
  <div class="learning-path-timeline">
    <EmptyState v-if="!path" title="未选择学习路径" description="创建或选择一条路径后，这里会显示步骤时间线。" />
    <template v-else>
      <div class="learning-path-timeline__summary">
        <div>
          <span>{{ path.status }}</span>
          <h2>{{ path.title }}</h2>
          <p>{{ path.topic }}</p>
        </div>
        <el-progress type="dashboard" :percentage="Math.round(path.completion_rate)" />
      </div>

      <el-alert v-if="path.warnings?.length" type="warning" :closable="false" class="teacher-generation-page__alert">
        <ul>
          <li v-for="warning in path.warnings" :key="warning">{{ warning }}</li>
        </ul>
      </el-alert>

      <el-timeline>
        <el-timeline-item
          v-for="step in path.path_steps"
          :key="step.step_index"
          :type="timelineType(step)"
          :hollow="step.step_index > path.current_step"
          :timestamp="`${step.estimated_minutes} 分钟`"
        >
          <el-card shadow="never" :class="['path-step-card', { 'path-step-card--current': step.step_index === path.current_step }]">
            <div class="path-step-card__head">
              <div>
                <span>第 {{ step.step_index + 1 }} 步</span>
                <strong>{{ step.title }}</strong>
              </div>
              <el-tag :type="step.step_index < path.current_step ? 'success' : step.step_index === path.current_step ? 'primary' : 'info'">
                {{ stepStatus(step) }}
              </el-tag>
            </div>
            <p>{{ step.objective }}</p>
            <div class="path-step-card__tags">
              <el-tag v-for="point in step.knowledge_points" :key="point" size="small">{{ point }}</el-tag>
            </div>
            <dl>
              <dt>学习活动</dt>
              <dd>{{ step.learning_activity }}</dd>
              <dt>练习任务</dt>
              <dd>{{ step.practice_task }}</dd>
              <dt>完成标准</dt>
              <dd>{{ step.completion_criteria }}</dd>
              <dt v-if="step.suggested_resource_ids?.length">推荐资源</dt>
              <dd v-if="step.suggested_resource_ids?.length">
                {{ step.suggested_resource_ids.length }} 个关联资源，可在学习资源页按标题查看
              </dd>
              <dt v-if="step.reflection">反思记录</dt>
              <dd v-if="step.reflection">{{ step.reflection }}</dd>
            </dl>

            <div v-if="step.step_index === path.current_step && path.status !== 'completed'" class="path-step-card__advance">
              <el-input v-model="reflection" type="textarea" :rows="2" placeholder="完成本步骤后的反思" />
              <el-input-number v-model="timeSpentMinutes" :min="1" :max="480" />
              <el-button type="success" @click="$emit('advance', step.step_index, reflection, timeSpentMinutes)">
                完成本步骤
              </el-button>
            </div>

            <div class="path-step-card__actions">
              <el-button size="small" @click="$emit('quiz', step.step_index)">生成小测</el-button>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import type { LearningPath, LearningPathStep } from '@/api/learningPaths'
import EmptyState from '@/components/common/EmptyState.vue'

const props = defineProps<{
  path: LearningPath | null
}>()

defineEmits<{
  advance: [stepIndex: number, reflection: string, timeSpentMinutes: number]
  quiz: [stepIndex: number]
}>()

const reflection = ref('')
const timeSpentMinutes = ref(60)

function timelineType(step: LearningPathStep) {
  if (!props.path) return 'info'
  if (step.step_index < props.path.current_step) return 'success'
  if (step.step_index === props.path.current_step) return 'primary'
  return 'info'
}

function stepStatus(step: LearningPathStep) {
  if (!props.path) return step.status
  if (step.step_index < props.path.current_step) return '已完成'
  if (step.step_index === props.path.current_step) return '当前步骤'
  return step.status || '等待中'
}
</script>
