<template>
  <section class="page-stack">
    <div class="page-hero">
      <div>
        <span>{{ historyCopy.kicker }}</span>
        <h1>{{ historyCopy.title }}</h1>
        <p>{{ historyCopy.description }}</p>
      </div>
    </div>

    <el-card shadow="never" class="table-card">
      <div class="table-toolbar">
        <el-input v-model="keyword" clearable placeholder="搜索当前页标题" style="width: 240px" />
        <el-select v-model="filters.artifact_type" clearable placeholder="产物类型" style="width: 220px" @change="loadArtifacts">
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button :loading="loading" @click="loadArtifacts">刷新</el-button>
      </div>

      <EmptyState v-if="!loading && !filteredItems.length" title="暂无生成产物" description="生成教学资源后，这里会显示历史记录。" />
      <el-table v-else v-loading="loading" :data="filteredItems" style="width: 100%">
        <el-table-column prop="title" label="标题" min-width="260" />
        <el-table-column label="类型" width="170">
          <template #default="{ row }">{{ artifactTypeLabels[row.artifact_type as ArtifactType] || row.artifact_type }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="创建时间" width="190">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="table-pagination">
        <el-pagination
          v-model:current-page="filters.page"
          v-model:page-size="filters.page_size"
          background
          layout="prev, pager, next, sizes, total"
          :total="total"
          @current-change="loadArtifacts"
          @size-change="loadArtifacts"
        />
      </div>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  artifactTypeLabels,
  getGeneratedArtifacts,
  type ArtifactType,
  type GeneratedArtifactListItem
} from '@/api/teacher'
import EmptyState from '@/components/common/EmptyState.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import { formatDateTime } from '@/utils/format'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const keyword = ref('')
const items = ref<GeneratedArtifactListItem[]>([])
const total = ref(0)
const filters = reactive<{ artifact_type: ArtifactType | ''; page: number; page_size: number }>({
  artifact_type: '',
  page: 1,
  page_size: 20
})

const typeOptions = Object.entries(artifactTypeLabels).map(([value, label]) => ({ value, label }))
const historyCopy = computed(() => {
  if (filters.artifact_type === 'exercise') {
    return { kicker: 'My Exercises', title: '我的习题', description: '查看所有已经生成并保存的习题，点击记录可阅读完整内容。' }
  }
  if (filters.artifact_type === 'paper') {
    return { kicker: 'My Papers', title: '我的试卷', description: '查看所有已经生成并保存的试卷，点击记录可阅读完整内容。' }
  }
  return { kicker: 'Artifact History', title: '生成历史', description: '按类型、标题和当前页关键词查看教师端生成产物，打开详情后可阅读完整 Markdown。' }
})
const filteredItems = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((item) => item.title.toLowerCase().includes(query))
})

function normalizeItems(data: unknown): GeneratedArtifactListItem[] {
  if (Array.isArray(data)) return data as GeneratedArtifactListItem[]
  if (data && typeof data === 'object') {
    const record = data as { items?: GeneratedArtifactListItem[]; artifacts?: GeneratedArtifactListItem[] }
    return record.items || record.artifacts || []
  }
  return []
}

async function loadArtifacts() {
  loading.value = true
  try {
    const data = await getGeneratedArtifacts(filters)
    items.value = normalizeItems(data)
    total.value = Array.isArray(data) ? data.length : data.total || items.value.length
  } finally {
    loading.value = false
  }
}

function openDetail(row: GeneratedArtifactListItem) {
  router.push(`/teacher/artifacts/${row.id || row.artifact_id}`)
}

onMounted(() => {
  const queryType = Array.isArray(route.query.artifact_type) ? route.query.artifact_type[0] : route.query.artifact_type
  if (queryType && queryType in artifactTypeLabels) filters.artifact_type = queryType as ArtifactType
  void loadArtifacts()
})
</script>
