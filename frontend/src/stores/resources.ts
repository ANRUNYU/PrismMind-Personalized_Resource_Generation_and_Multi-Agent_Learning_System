import { defineStore } from 'pinia'

import {
  generateResources,
  generateResourcesAsync,
  generateSingleResource,
  generateSingleResourceAsync,
  getResource,
  getResources,
  markResourceCompleted,
  markResourceViewed,
  rateResource,
  type LearningResource,
  type ResourceGenerateRequest,
  type ResourceGenerateResponse,
  type ResourceGenerateSingleRequest,
  type ResourceListResponse,
  type ResourceType
} from '@/api/resources'
import type { TaskCreateResponse } from '@/types/task'

export const useResourcesStore = defineStore('resources', {
  state: () => ({
    resources: [] as LearningResource[],
    total: 0,
    currentResource: null as LearningResource | null,
    lastGeneration: null as ResourceGenerateResponse | null,
    loading: false,
    generating: false,
    detailLoading: false
  }),
  actions: {
    async generateResources(payload: ResourceGenerateRequest) {
      this.generating = true
      try {
        const data = await generateResources(payload)
        this.lastGeneration = data
        await this.fetchResources()
        return data
      } finally {
        this.generating = false
      }
    },
    async generateResourcesAsync(payload: ResourceGenerateRequest): Promise<TaskCreateResponse> {
      this.generating = true
      try {
        return await generateResourcesAsync(payload)
      } finally {
        this.generating = false
      }
    },
    async generateSingleResource(payload: ResourceGenerateSingleRequest) {
      this.generating = true
      try {
        const data = await generateSingleResource(payload)
        this.lastGeneration = data
        await this.fetchResources()
        return data
      } finally {
        this.generating = false
      }
    },
    async generateSingleResourceAsync(payload: ResourceGenerateSingleRequest): Promise<TaskCreateResponse> {
      this.generating = true
      try {
        return await generateSingleResourceAsync(payload)
      } finally {
        this.generating = false
      }
    },
    async fetchResources(params?: {
      page?: number
      page_size?: number
      resource_type?: ResourceType | ''
      topic?: string
      is_completed?: boolean | null
      difficulty_level?: string | null
    }) {
      this.loading = true
      try {
        const data: ResourceListResponse = await getResources(params)
        this.resources = data.items
        this.total = data.total
        return data
      } finally {
        this.loading = false
      }
    },
    async fetchResource(resourceId: number) {
      this.detailLoading = true
      try {
        this.currentResource = await getResource(resourceId)
        return this.currentResource
      } finally {
        this.detailLoading = false
      }
    },
    async markViewed(resourceId: number) {
      const action = await markResourceViewed(resourceId)
      this.patchResource(resourceId, action)
      if (this.currentResource?.id === resourceId) this.currentResource.is_viewed = action.is_viewed
      return action
    },
    async markCompleted(resourceId: number) {
      const action = await markResourceCompleted(resourceId)
      this.patchResource(resourceId, action)
      if (this.currentResource?.id === resourceId) this.currentResource.is_completed = action.is_completed
      return action
    },
    async rateResource(resourceId: number, userRating: number) {
      const action = await rateResource(resourceId, { user_rating: userRating })
      this.patchResource(resourceId, action)
      if (this.currentResource?.id === resourceId) this.currentResource.user_rating = action.user_rating
      return action
    },
    patchResource(resourceId: number, patch: { is_viewed?: boolean; is_completed?: boolean; user_rating?: number | null }) {
      this.resources = this.resources.map((resource) =>
        resource.id === resourceId
          ? {
              ...resource,
              is_viewed: patch.is_viewed ?? resource.is_viewed,
              is_completed: patch.is_completed ?? resource.is_completed,
              user_rating: patch.user_rating ?? resource.user_rating
            }
          : resource
      )
    }
  }
})
