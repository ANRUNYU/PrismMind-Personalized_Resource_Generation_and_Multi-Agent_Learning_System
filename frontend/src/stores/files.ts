import { defineStore } from 'pinia'

import { deleteFile, downloadFile, listFiles, type FileAsset } from '@/api/files'

export const useFilesStore = defineStore('files', {
  state: () => ({
    recentFiles: [] as FileAsset[],
    loading: false,
    total: 0
  }),
  actions: {
    async fetchFiles() {
      this.loading = true
      try {
        const response = await listFiles({ page: 1, page_size: 30 })
        this.recentFiles = response.items
        this.total = response.total
      } finally {
        this.loading = false
      }
    },
    addRecentFile(file: FileAsset) {
      this.recentFiles = [file, ...this.recentFiles.filter((item) => item.id !== file.id)].slice(0, 30)
      this.total = Math.max(this.total, this.recentFiles.length)
    },
    removeRecentFile(fileId: number) {
      this.recentFiles = this.recentFiles.filter((item) => item.id !== fileId)
      this.total = Math.max(this.total - 1, this.recentFiles.length)
    },
    async deleteRecentFile(fileId: number) {
      await deleteFile(fileId)
      this.removeRecentFile(fileId)
    },
    async downloadRecentFile(file: FileAsset) {
      const blob = await downloadFile(file.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.original_filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    }
  }
})
