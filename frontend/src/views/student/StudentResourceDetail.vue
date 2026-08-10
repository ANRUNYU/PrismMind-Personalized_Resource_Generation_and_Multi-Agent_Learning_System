<template>
  <main class="resource-detail-page" data-testid="student-resource-detail">
    <div class="resource-detail-back-row">
      <RouterLink class="resource-detail-back" to="/student/resources">
        <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
        <span>返回资源列表</span>
      </RouterLink>
    </div>

    <section v-if="loading" class="resource-detail-state" aria-live="polite">
      <span class="resource-detail-loader" aria-hidden="true" />
      <strong>正在加载资源详情</strong>
      <p>正在同步资源内容与生成依据...</p>
    </section>

    <section v-else-if="error" class="resource-detail-state resource-detail-state--error" role="alert">
      <el-icon aria-hidden="true"><Warning /></el-icon>
      <strong>资源详情加载失败</strong>
      <p>{{ error }}</p>
    </section>

    <template v-else-if="resource">
      <header class="resource-detail-hero">
        <div class="resource-detail-hero-copy">
          <p class="resource-detail-eyebrow">
            <span>{{ resourceTypeText }}</span>
            <i aria-hidden="true">•</i>
            <time :datetime="resource.created_at">{{ formatTime(resource.created_at) }}</time>
          </p>
          <h1>{{ resource.title }}</h1>
          <div class="resource-detail-status-row" aria-label="资源状态">
            <span class="resource-status-chip resource-status-chip--complete">
              完成状态：<strong>{{ resource.is_completed ? '已完成' : '学习中' }}</strong>
            </span>
            <span class="resource-status-chip resource-status-chip--rating">
              <el-icon aria-hidden="true"><Star /></el-icon>
              评分：<strong>{{ ratingText }}</strong>
            </span>
          </div>
        </div>
        <div class="resource-detail-prism" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </header>

      <div class="resource-detail-grid">
        <section class="resource-detail-panel resource-profile-panel" aria-labelledby="profile-basis-title">
          <header class="resource-detail-section-title">
            <span aria-hidden="true" />
            <h2 id="profile-basis-title">本资源如何依据你的画像生成</h2>
          </header>

          <p v-if="!hasProfileSnapshot" class="resource-profile-note">
            本资源生成时未使用学习画像，以下画像信息均未记录。
          </p>

          <div class="resource-profile-grid">
            <article v-for="fact in profileFacts" :key="fact.key" class="resource-profile-fact">
              <span class="resource-profile-icon" aria-hidden="true">
                <el-icon><component :is="fact.icon" /></el-icon>
              </span>
              <p><strong>{{ fact.label }}：</strong>{{ fact.value }}</p>
            </article>
          </div>

          <div v-if="profileDimensions.length" class="resource-profile-dimensions">
            <strong>六维画像依据</strong>
            <div>
              <span v-for="dimension in profileDimensions" :key="dimension.key">
                {{ dimension.label }} <b>{{ dimension.value }}</b>
              </span>
            </div>
          </div>

          <div class="resource-strategy-block">
            <h3>
              <span class="resource-strategy-icon" aria-hidden="true"><el-icon><Sunny /></el-icon></span>
              生成策略
            </h3>
            <ul v-if="generationStrategies.length">
              <li v-for="strategy in generationStrategies" :key="strategy">{{ strategy }}</li>
            </ul>
            <p v-else class="resource-inline-empty">本次生成未记录个性化生成策略。</p>
          </div>
        </section>

        <div class="resource-detail-side-stack">
          <section class="resource-detail-panel resource-reference-panel" aria-labelledby="reference-title">
            <header class="resource-detail-section-title">
              <span aria-hidden="true" />
              <h2 id="reference-title">知识库引用</h2>
            </header>

            <div v-if="!references.length" class="resource-reference-empty">
              <el-icon aria-hidden="true"><Document /></el-icon>
              <p>本次生成没有可用的知识库证据。</p>
            </div>
            <div v-else class="resource-reference-list">
              <article v-for="(reference, index) in references" :key="referenceKey(reference, index)">
                <div class="resource-reference-heading">
                  <el-icon aria-hidden="true"><Document /></el-icon>
                  <strong>{{ reference.source_filename || `引用 ${index + 1}` }}</strong>
                </div>
                <p v-if="reference.excerpt">{{ reference.excerpt }}</p>
                <dl>
                  <template v-if="reference.chunk_index !== null && reference.chunk_index !== undefined">
                    <dt>分块</dt><dd>{{ reference.chunk_index }}</dd>
                  </template>
                  <template v-if="reference.score !== null && reference.score !== undefined">
                    <dt>检索得分</dt><dd>{{ formatScore(reference.score) }}</dd>
                  </template>
                </dl>
              </article>
            </div>
          </section>

          <section class="resource-detail-panel resource-quality-panel" aria-labelledby="quality-title">
            <header class="resource-detail-section-title">
              <span aria-hidden="true" />
              <h2 id="quality-title">质量分析</h2>
            </header>
            <h3>生成质量诊断报告</h3>

            <div v-if="qualityMetrics.length" class="resource-quality-metrics">
              <article v-for="metric in qualityMetrics" :key="metric.label">
                <div><strong>{{ metric.label }}</strong><span>{{ metric.value }}%</span></div>
                <div class="resource-quality-track" aria-hidden="true"><i :style="{ width: `${metric.value}%` }" /></div>
                <small>{{ metric.description }}</small>
              </article>
            </div>

            <div v-else class="resource-quality-empty">
              <el-icon aria-hidden="true"><InfoFilled /></el-icon>
              <div>
                <p>{{ qualityUnavailableText }}</p>
                <small v-if="qualityUnavailableReason">{{ qualityUnavailableReason }}</small>
              </div>
            </div>

            <div v-if="qualityKeypoints.length" class="resource-quality-keypoints">
              <strong>已覆盖关键点</strong>
              <div><span v-for="point in qualityKeypoints" :key="point">{{ point }}</span></div>
            </div>
            <div v-if="qualityMissingPoints.length" class="resource-quality-keypoints resource-quality-keypoints--missing">
              <strong>待补充关键点</strong>
              <div><span v-for="point in qualityMissingPoints" :key="point">{{ point }}</span></div>
            </div>
            <ul v-if="qualityWarnings.length" class="resource-quality-warnings">
              <li v-for="warning in qualityWarnings" :key="warning">{{ warning }}</li>
            </ul>
          </section>
        </div>
      </div>

      <section class="resource-detail-panel resource-content-panel" aria-labelledby="resource-content-title">
        <header class="resource-detail-section-title resource-content-title-row">
          <div>
            <span aria-hidden="true" />
            <h2 id="resource-content-title">完整正文</h2>
          </div>
          <div class="resource-content-meta" aria-label="资源正文元数据">
            <span v-if="resource.topic">
              <strong>主题</strong>
              <em>{{ resource.topic }}</em>
            </span>
            <span v-if="difficultyText">
              <strong>难度</strong>
              <em>{{ difficultyText }}</em>
            </span>
          </div>
        </header>
        <article class="resource-markdown-body" v-html="safeContent" />
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue'
import { useRoute } from 'vue-router'
import {
  Aim,
  ArrowLeft,
  Document,
  InfoFilled,
  Reading,
  Star,
  Sunny,
  TrendCharts,
  User,
  Warning
} from '@element-plus/icons-vue'

import {
  getResource,
  markResourceViewed,
  resourceTypeLabels,
  type LearningResource,
  type ResourceReference,
  type ResourceType
} from '@/api/resources'
import { renderMarkdown } from '@/utils/markdown'

interface ProfileFact {
  key: string
  label: string
  value: string
  icon: Component
}

interface QualityMetric {
  label: string
  value: number
  description: string
}

interface ProfileDimension {
  key: string
  label: string
  value: string
}

const route = useRoute()
const resource = ref<LearningResource | null>(null)
const loading = ref(true)
const error = ref('')

const safeContent = computed(() => renderMarkdown(resource.value?.content || ''))
const profileSnapshot = computed(() => resource.value?.profile_snapshot || null)
const hasProfileSnapshot = computed(() => Boolean(profileSnapshot.value))
const references = computed(() => resource.value?.reference_snapshot || [])
const analysis = computed(() => resource.value?.quality_analysis || null)

const resourceTypeText = computed(() => {
  const type = resource.value?.resource_type
  if (!type) return '学习资源'
  return resourceTypeLabels[type as ResourceType] || type
})

const ratingText = computed(() => {
  const rating = resource.value?.user_rating
  return typeof rating === 'number' ? `${rating} 分` : '未评分'
})

const difficultyText = computed(() => {
  const difficulty = resource.value?.difficulty_level
  if (!difficulty) return ''
  return ({ easy: '简单', normal: '常规', hard: '困难' } as Record<string, string>)[difficulty] || difficulty
})

const profileFacts = computed<ProfileFact[]>(() => [
  { key: 'goal', label: '学习目标', value: scalarText(profileSnapshot.value?.learning_goal, '未填写'), icon: Aim },
  { key: 'course', label: '课程/本次主题', value: scalarText(profileSnapshot.value?.course, resource.value?.topic || '未指定'), icon: Reading },
  { key: 'weaknesses', label: '弱项/提升重点', value: joinedValues(profileSnapshot.value?.weaknesses, joinedValues(profileSnapshot.value?.development_focus, '未记录')), icon: TrendCharts },
  { key: 'preferences', label: '学习偏好', value: scalarText(profileSnapshot.value?.learning_preferences, '未填写'), icon: User }
])

const profileDimensions = computed<ProfileDimension[]>(() => {
  const values = profileSnapshot.value?.dimension_scores
  if (!values || typeof values !== 'object' || Array.isArray(values)) return []
  const labels: Record<string, string> = {
    knowledge_score: '知识基础',
    practice_score: '实践能力',
    innovation_score: '创新能力',
    exam_score: '应试能力',
    efficiency_score: '学习效率',
    quality_score: '学习质量'
  }
  return Object.entries(labels)
    .map(([key, label]) => {
      const rawValue = (values as Record<string, unknown>)[key]
      const score = typeof rawValue === 'number' ? rawValue : Number(rawValue)
      return Number.isFinite(score) && score > 0 ? { key, label, value: `${Math.round(score)} 分` } : null
    })
    .filter((item): item is ProfileDimension => Boolean(item))
})

const generationStrategies = computed(() => arrayValues(profileSnapshot.value?.personalization_strategies))

const qualityMetrics = computed<QualityMetric[]>(() => {
  const current = analysis.value
  if (!current) return []
  if (current.analysis_version === 'qa-v2' && current.evidence_available) {
    return [
      qualityMetric('来源覆盖率', current.source_coverage, '证据关键点被生成内容覆盖的比例'),
      qualityMetric('来源匹配度', current.source_match_rate, '生成内容与实际引用证据的匹配程度'),
      qualityMetric('诊断可信度', current.diagnostic_confidence, '表示证据完整性与分析稳定性')
    ].filter((metric): metric is QualityMetric => Boolean(metric))
  }
  if (current.coverage && current.depth && current.confidence) {
    return [
      qualityMetric('历史覆盖指标', current.coverage.coverage_rate, '该记录使用历史质量分析算法'),
      qualityMetric('历史诊断值', current.confidence.score, current.confidence.explanation || '历史诊断记录')
    ].filter((metric): metric is QualityMetric => Boolean(metric))
  }
  return []
})

const qualityUnavailableText = computed(() => {
  if (!analysis.value) return '本次生成未提供质量分析数据，无法展示覆盖率、匹配度或可信度。'
  if (analysis.value.analysis_version === 'qa-v2' && !analysis.value.evidence_available) {
    return '本次生成没有可用的知识库证据，无法计算来源覆盖率与匹配度。'
  }
  return '当前记录未提供可展示的质量诊断指标。'
})

const qualityUnavailableReason = computed(() => scalarText(analysis.value?.unavailable_reason, ''))
const qualityKeypoints = computed(() => arrayValues(analysis.value?.matched_keypoints?.map((item) => item.keypoint)))
const qualityMissingPoints = computed(() => arrayValues(analysis.value?.missing_keypoints))
const qualityWarnings = computed(() => arrayValues(analysis.value?.warnings))

function qualityMetric(label: string, rawValue: number | null | undefined, description: string): QualityMetric | null {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return null
  return { label, value: Math.round(Math.min(1, Math.max(0, rawValue)) * 100), description }
}

function scalarText(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

function arrayValues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => scalarText(item, ''))
    .filter(Boolean)
}

function joinedValues(value: unknown, fallback: string) {
  return arrayValues(value).join('、') || fallback
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatScore(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : '未记录'
}

function referenceKey(reference: ResourceReference, index: number) {
  return `${reference.document_id ?? 'document'}-${reference.chunk_index ?? index}-${reference.source_filename ?? index}`
}

onMounted(async () => {
  try {
    const id = Number(route.params.resourceId)
    if (!Number.isInteger(id) || id <= 0) throw new Error('无效的资源 ID')
    resource.value = await getResource(id)
    await markResourceViewed(id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '资源详情加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped src="./StudentResourceDetail.css"></style>
