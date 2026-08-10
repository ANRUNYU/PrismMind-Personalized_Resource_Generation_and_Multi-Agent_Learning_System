import { useCallback, useEffect, useState } from 'react'

import { getKnowledgeDocuments, type KnowledgeDocument } from '@/api/knowledge'
import KnowledgeDocumentMultiSelect from '../../shared/KnowledgeDocumentMultiSelect'

import './teacher-knowledge-source.css'

interface TeacherKnowledgeSourceSelectorProps {
  value: number[]
  onChange: (documentIds: number[]) => void
  disabled?: boolean
}

export function TeacherKnowledgeSourceSelector({ value, onChange, disabled = false }: TeacherKnowledgeSourceSelectorProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('只有已入库资料可用于生成，支持多选。')

  const refresh = useCallback(async (autoSelectId?: number) => {
    setLoading(true)
    try {
      const response = await getKnowledgeDocuments({ status: 'ingested', page: 1, page_size: 100 })
      setDocuments(response.items)
      if (autoSelectId && response.items.some((item) => item.id === autoSelectId)) {
        onChange([...new Set([...value, autoSelectId])])
        setMessage('新资料已入库并自动选中。')
      } else {
        setMessage(response.items.length ? `已加载 ${response.items.length} 份就绪资料。` : '知识库暂无已入库资料。')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '知识库资料加载失败。')
    } finally {
      setLoading(false)
    }
  }, [onChange, value])

  useEffect(() => {
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleUpdated = (event: Event) => {
      const documentId = Number((event as CustomEvent<{ documentId?: number }>).detail?.documentId || 0)
      void refresh(documentId || undefined)
    }
    window.addEventListener('teacher-knowledge-updated', handleUpdated)
    return () => window.removeEventListener('teacher-knowledge-updated', handleUpdated)
  }, [refresh])

  const selectLatest = async () => {
    setLoading(true)
    try {
      const response = await getKnowledgeDocuments({ status: 'ingested', page: 1, page_size: 100 })
      setDocuments(response.items)
      const latest = response.items[0]
      if (!latest) {
        setMessage('知识库暂无已入库资料。')
        return
      }
      onChange([...new Set([...value, latest.id])])
      setMessage(`已选择最新资料：${latest.title}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '刷新失败。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="teacher-knowledge-source" aria-label="选择知识库来源">
      <span className="field-label">选择生成知识来源（支持多选）</span>
      <KnowledgeDocumentMultiSelect
        documents={documents}
        selectedIds={value}
        disabled={disabled}
        loading={loading}
        hint={message}
        onChange={onChange}
      />
      <div className="action-row teacher-knowledge-source__actions">
        <button className="secondary-action" type="button" disabled={disabled} onClick={() => window.dispatchEvent(new Event('teacher-knowledge-upload-open'))}>上传资料</button>
        <button className="secondary-action" type="button" disabled={disabled || loading} onClick={() => void selectLatest()}>{loading ? '刷新中…' : '刷新并选择最新就绪资料'}</button>
      </div>
    </section>
  )
}
