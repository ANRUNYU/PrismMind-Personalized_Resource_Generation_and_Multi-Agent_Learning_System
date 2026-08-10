<template>
  <section class="teacher-generation-page">
    <div class="page-hero teacher-generation-page__hero">
      <div>
        <span>教师资源生成</span>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <router-link to="/teacher/artifacts">
        <el-button>查看历史</el-button>
      </router-link>
    </div>

    <el-row :gutter="20" class="teacher-generation-page__grid">
      <el-col :xs="24" :lg="10">
        <el-card shadow="never" class="generation-card">
          <template #header>
            <div class="generation-card__header">
              <strong>生成参数</strong>
              <slot name="actions" />
            </div>
          </template>
          <slot name="form" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="14">
        <div class="teacher-generation-page__result">
          <el-skeleton v-if="loading" :rows="12" animated />
          <GenerationResult v-else :result="result" @clear="$emit('clear')" />

          <el-alert
            v-for="warning in warnings"
            :key="warning"
            class="teacher-generation-page__alert"
            type="warning"
            :closable="false"
            :title="warning"
          />

          <div v-if="references?.length" class="reference-list">
            <h3>知识引用</h3>
            <article v-for="(reference, index) in references" :key="index" class="reference-card">
              <span>{{ reference.source_filename || reference.source_type }}</span>
              <strong>
                {{ reference.document_id ? '课程资料' : '' }}
                {{ reference.chunk_index !== null && reference.chunk_index !== undefined ? ' / 相关片段' : '' }}
              </strong>
              <p>{{ reference.excerpt }}</p>
            </article>
          </div>
        </div>
      </el-col>
    </el-row>
  </section>
</template>

<script setup lang="ts">
import GenerationResult from '@/components/teacher/GenerationResult.vue'
import type { GenerationReference, TeacherGenerationResponse } from '@/api/teacher'

defineProps<{
  title: string
  description: string
  loading?: boolean
  result?: TeacherGenerationResponse | null
  references?: GenerationReference[] | null
  warnings?: string[] | null
}>()

defineEmits<{
  clear: []
}>()
</script>
