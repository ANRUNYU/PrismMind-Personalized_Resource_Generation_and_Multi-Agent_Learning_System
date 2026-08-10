import { defineStore } from 'pinia'

import { getTask, getTasks } from '@/api/tasks'
import type { TaskDetail, TaskItem, TaskListResponse, TaskQuery } from '@/types/task'

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: [] as TaskItem[],
    currentTask: null as TaskDetail | null,
    total: 0,
    loading: false,
    detailLoading: false
  }),
  actions: {
    async fetchTasks(params?: TaskQuery) {
      this.loading = true
      try {
        const data: TaskListResponse = await getTasks(params)
        this.tasks = data.items
        this.total = data.total
        return data
      } finally {
        this.loading = false
      }
    },
    async fetchTask(taskId: number | string) {
      this.detailLoading = true
      try {
        this.currentTask = await getTask(taskId)
        return this.currentTask
      } finally {
        this.detailLoading = false
      }
    }
  }
})
