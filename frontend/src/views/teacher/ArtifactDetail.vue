<template>
  <section class="artifact-detail-page page-stack">
    <div class="page-hero">
      <div class="artifact-detail-page__hero-copy">
        <span>{{ artifact ? artifactTypeLabels[artifact.artifact_type] : 'Artifact detail' }}</span>
        <h1>{{ artifact?.title || '正在加载生成产物' }}</h1>
        <p>{{ artifact ? `${artifact.status} · ${formatDateTime(artifact.created_at)}` : '正在获取生成文档。' }}</p>
      </div>
      <router-link to="/teacher/artifacts">
        <el-button>返回列表</el-button>
      </router-link>
    </div>

    <LoadingState v-if="loading" :rows="14" min-height="520px" />
    <ErrorState v-else-if="loadError" :description="loadError" retry-text="重新加载" @retry="loadArtifact" />
    <el-row v-else-if="artifact" :gutter="20" class="artifact-detail-layout">
      <el-col :xs="24" :lg="16" class="artifact-detail-column artifact-detail-main-column">
        <el-card shadow="never" class="artifact-detail-card">
          <MarkdownViewer :content="artifact.content" />
        </el-card>
        <QualityAnalysisPanel :analysis="artifact.quality_analysis" />
      </el-col>
      <el-col :xs="24" :lg="8" class="artifact-detail-column artifact-detail-side-column">
        <el-card shadow="never" class="artifact-side-card">
          <template #header>
            <div class="panel-header">
              <strong>请求摘要</strong>
              <StatusTag :status="artifact.status" />
            </div>
          </template>
          <pre>{{ JSON.stringify(artifact.request_payload || {}, null, 2) }}</pre>
        </el-card>
        <el-card v-if="artifact.warnings?.length" shadow="never" class="artifact-side-card">
          <template #header><strong>生成提示</strong></template>
          <el-alert
            v-for="warning in artifact.warnings"
            :key="warning"
            type="warning"
            :closable="false"
            :title="warning"
            show-icon
          />
        </el-card>
        <el-card v-if="artifact.references?.length" shadow="never" class="artifact-side-card">
          <template #header><strong>知识引用</strong></template>
          <article v-for="(reference, index) in artifact.references" :key="index" class="reference-card">
            <span>{{ reference.source_filename || reference.source_type }}</span>
            <p>{{ reference.excerpt }}</p>
          </article>
        </el-card>
      </el-col>
    </el-row>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { artifactTypeLabels, getGeneratedArtifact, type GeneratedArtifactDetail } from '@/api/teacher'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QualityAnalysisPanel from '@/components/common/QualityAnalysisPanel.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const loading = ref(false)
const loadError = ref('')
const artifact = ref<GeneratedArtifactDetail | null>(null)

async function loadArtifact() {
  loading.value = true
  loadError.value = ''
  try {
    artifact.value = await getGeneratedArtifact(String(route.params.id))
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '生成产物加载失败。'
  } finally {
    loading.value = false
  }
}

onMounted(loadArtifact)
</script>

<style scoped>
.artifact-detail-page {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: clip;
}

.artifact-detail-page__hero-copy {
  min-width: 0;
}

.artifact-detail-page__hero-copy h1,
.artifact-detail-page__hero-copy p {
  overflow-wrap: anywhere;
}

.artifact-detail-page .page-hero > a {
  flex: 0 0 auto;
}

.artifact-detail-layout {
  width: 100%;
  min-width: 0;
  margin-bottom: 0;
}

.artifact-detail-column,
.artifact-detail-main-column,
.artifact-detail-side-column {
  min-width: 0;
  max-width: 100%;
}

.artifact-detail-main-column,
.artifact-detail-side-column {
  display: grid;
  align-content: start;
  gap: 16px;
}

.artifact-detail-card,
.artifact-side-card {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  overflow: hidden;
}

.artifact-detail-page :deep(.el-card__body),
.artifact-detail-page :deep(.markdown-viewer),
.artifact-detail-page :deep(.markdown-body),
.artifact-detail-page :deep(.quality-panel) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.artifact-detail-page :deep(.markdown-viewer__toolbar) {
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.artifact-detail-page :deep(.markdown-body) {
  overflow-x: auto;
}

.artifact-detail-page :deep(.markdown-body table) {
  width: 100%;
  min-width: 0;
  table-layout: fixed;
}

.artifact-detail-page :deep(.markdown-body th),
.artifact-detail-page :deep(.markdown-body td),
.artifact-detail-page :deep(.markdown-body a) {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.artifact-detail-page :deep(.markdown-body img),
.artifact-detail-page :deep(.markdown-body video),
.artifact-detail-page :deep(.markdown-body svg),
.artifact-detail-page :deep(.markdown-body canvas) {
  max-width: 100%;
  height: auto;
}

.artifact-side-card pre {
  width: 100%;
  max-width: 100%;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.reference-card {
  min-width: 0;
}

.reference-card span,
.reference-card p {
  overflow-wrap: anywhere;
  word-break: break-word;
}

@media (max-width: 1199px) {
  .artifact-detail-main-column {
    margin-bottom: 16px;
  }
}

@media (max-width: 640px) {
  .artifact-detail-page .page-hero {
    min-height: auto;
    align-items: stretch;
  }

  .artifact-detail-page .page-hero > a,
  .artifact-detail-page .page-hero :deep(.el-button) {
    width: 100%;
  }

  .artifact-detail-page :deep(.markdown-body) {
    min-height: 0;
    padding: 14px;
    font-size: 14px;
  }

  .artifact-detail-page :deep(.markdown-body h1) {
    font-size: 23px;
  }

  .artifact-detail-page :deep(.markdown-body h2) {
    font-size: 18px;
  }
}
</style>
