<template>
  <section v-if="citations.length" class="citation-panel" aria-label="知识来源">
    <h3>知识来源</h3>
    <article v-for="citation in citations" :key="citation.citation_id" class="citation-card">
      <div class="citation-head">
        <strong>[{{ citation.citation_id }}] {{ citation.source_filename }}</strong>
        <el-tag v-if="citation.similarity != null" size="small" type="success">
          匹配度 {{ formatSimilarity(citation.similarity) }}
        </el-tag>
      </div>
      <p class="location">{{ location(citation) }}</p>
      <blockquote v-if="citation.excerpt">{{ citation.excerpt }}</blockquote>
      <el-link v-if="citation.open_url" :href="citation.open_url" target="_blank" rel="noopener noreferrer">
        打开原文
      </el-link>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { CitationItem } from '@/types/task'

defineProps<{ citations: CitationItem[] }>()

function formatSimilarity(value: number) { return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }
function location(item: CitationItem) {
  const parts: string[] = []
  if (item.page_number) parts.push(`第 ${item.page_number} 页`)
  if (item.slide_number) parts.push(`第 ${item.slide_number} 张幻灯片`)
  if (item.sheet_name) parts.push(`工作表 ${item.sheet_name}`)
  if (item.heading_path?.length) parts.push(item.heading_path.join(' / '))
  return parts.join(' · ') || '文档片段'
}
</script>

<style scoped>
.citation-panel{display:grid;gap:10px;margin-top:16px}.citation-panel h3{margin:0}.citation-card{padding:12px;border:1px solid var(--el-border-color);border-radius:8px;background:var(--el-fill-color-lighter)}.citation-head{display:flex;justify-content:space-between;gap:12px}.location{margin:6px 0;color:var(--el-text-color-secondary);font-size:13px}.citation-card blockquote{margin:8px 0;padding-left:12px;border-left:3px solid var(--el-color-primary);white-space:pre-wrap}
</style>
