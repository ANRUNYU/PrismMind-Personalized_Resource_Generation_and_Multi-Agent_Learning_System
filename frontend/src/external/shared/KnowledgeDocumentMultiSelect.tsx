import type { KnowledgeDocument } from '@/api/knowledge'

import './knowledge-document-multi-select.css'

export default function KnowledgeDocumentMultiSelect({
  documents,
  selectedIds,
  disabled = false,
  loading = false,
  emptyText = '知识库暂无已入库资料。',
  hint,
  ariaLabel = '知识库文件',
  onChange
}: {
  documents: Array<Pick<KnowledgeDocument, 'id' | 'title' | 'chunk_count'>>
  selectedIds: number[]
  disabled?: boolean
  loading?: boolean
  emptyText?: string
  hint?: string
  ariaLabel?: string
  onChange: (documentIds: number[]) => void
}) {
  const statusText = hint || (loading
    ? '正在读取知识库资料…'
    : documents.length
      ? `已加载 ${documents.length} 份就绪资料，已选择 ${selectedIds.length} 份。`
      : emptyText)

  return (
    <div className="knowledge-document-multi-select">
      <select
        multiple
        size={4}
        aria-label={ariaLabel}
        value={selectedIds.map(String)}
        disabled={disabled || loading || documents.length === 0}
        onChange={(event) => onChange(Array.from(event.currentTarget.selectedOptions, (option) => Number(option.value)))}
      >
        {documents.map((document) => (
          <option key={document.id} value={document.id}>{document.title} · {document.chunk_count} 个分块</option>
        ))}
      </select>
      <span className="field-hint knowledge-document-multi-select__hint">{statusText}</span>
    </div>
  )
}
