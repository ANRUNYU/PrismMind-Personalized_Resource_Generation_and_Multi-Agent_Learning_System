import { defineStore } from 'pinia'

import {
  deleteKnowledgeDocument,
  getKnowledgeDocuments,
  ingestKnowledgeDocument,
  ingestKnowledgeDocumentAsync,
  type KnowledgeDocument
} from '@/api/knowledge'
import type { TaskCreateResponse } from '@/types/task'

export const useKnowledgeStore = defineStore('knowledge', {
  state: () => ({
    documents: [] as KnowledgeDocument[],
    total: 0,
    page: 1,
    pageSize: 50,
    loading: false,
    ingestingIds: [] as number[]
  }),
  actions: {
    async fetchDocuments(params?: { page?: number; page_size?: number; status?: string | null; course_id?: number | null }) {
      this.loading = true
      try {
        const data = await getKnowledgeDocuments({
          page: params?.page || this.page,
          page_size: params?.page_size || this.pageSize,
          status: params?.status,
          course_id: params?.course_id
        })
        this.documents = data.items
        this.total = data.total
        this.page = data.page
        this.pageSize = data.page_size
      } finally {
        this.loading = false
      }
    },
    upsertDocument(document: KnowledgeDocument) {
      const next = this.documents.filter((item) => item.id !== document.id)
      this.documents = [document, ...next]
      this.total = Math.max(this.total, this.documents.length)
    },
    async ingestDocument(documentId: number) {
      if (!this.ingestingIds.includes(documentId)) this.ingestingIds.push(documentId)
      try {
        await ingestKnowledgeDocument(documentId)
        await this.fetchDocuments()
      } finally {
        this.ingestingIds = this.ingestingIds.filter((id) => id !== documentId)
      }
    },
    async ingestDocumentAsync(documentId: number): Promise<TaskCreateResponse> {
      if (!this.ingestingIds.includes(documentId)) this.ingestingIds.push(documentId)
      try {
        const task = await ingestKnowledgeDocumentAsync(documentId)
        await this.fetchDocuments()
        return task
      } finally {
        this.ingestingIds = this.ingestingIds.filter((id) => id !== documentId)
      }
    },
    async deleteDocument(documentId: number) {
      await deleteKnowledgeDocument(documentId)
      this.documents = this.documents.filter((item) => item.id !== documentId)
      this.total = Math.max(0, this.total - 1)
    }
  }
})
