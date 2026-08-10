import { defineStore } from 'pinia'

import {
  analyzeProfileConversation,
  buildProfileStep,
  createProfile,
  getMyProfile,
  getProfileQuestions,
  updateProfile,
  updateProfileScores,
  getProfileOnboarding,
  answerProfileOnboarding,
  type ProfileOnboardingState,
  type ProfileBuildRequest,
  type ProfileConversationRequest,
  type ProfileConversationResponse,
  type ProfileQuestion,
  type StudentProfile,
  type StudentProfileCreate,
  type StudentProfileUpdate,
  type ProfileScoreUpdate
} from '@/api/profile'

export const useProfileStore = defineStore('profile', {
  state: () => ({
    profile: null as StudentProfile | null,
    loading: false,
    saving: false,
    questions: [] as ProfileQuestion[],
    lastConversationAnalysis: null as ProfileConversationResponse | null
    , onboarding: null as ProfileOnboardingState | null
  }),
  actions: {
    async fetchProfile() {
      this.loading = true
      try {
        this.profile = await getMyProfile()
        return this.profile
      } catch (error: unknown) {
        const maybeResponse = error as { response?: { status?: number } }
        if (maybeResponse.response?.status === 404) {
          this.profile = null
          return null
        }
        throw error
      } finally {
        this.loading = false
      }
    },
    async createProfile(payload: StudentProfileCreate) {
      this.saving = true
      try {
        this.profile = await createProfile(payload)
        return this.profile
      } finally {
        this.saving = false
      }
    },
    async updateProfile(payload: StudentProfileUpdate) {
      this.saving = true
      try {
        this.profile = await updateProfile(payload)
        return this.profile
      } finally {
        this.saving = false
      }
    },
    async updateScores(payload: ProfileScoreUpdate) {
      this.saving = true
      try {
        this.profile = await updateProfileScores(payload)
        return this.profile
      } finally {
        this.saving = false
      }
    },
    async fetchQuestions() {
      const data = await getProfileQuestions()
      this.questions = data.questions
      return this.questions
    },
    async buildStep(payload: ProfileBuildRequest) {
      const data = await buildProfileStep(payload)
      this.profile = data.current_profile
      return data
    },
    async analyzeConversation(payload: ProfileConversationRequest) {
      const data = await analyzeProfileConversation(payload)
      this.lastConversationAnalysis = data
      if (data.current_profile) this.profile = data.current_profile
      return data
    },
    async fetchOnboarding() {
      this.loading = true
      try {
        this.onboarding = await getProfileOnboarding()
        this.profile = this.onboarding.current_profile
        return this.onboarding
      } finally { this.loading = false }
    },
    async answerOnboarding(answer: string, idempotencyKey: string) {
      if (!this.onboarding || this.saving) return this.onboarding
      this.saving = true
      try {
        this.onboarding = await answerProfileOnboarding({ conversation_id: this.onboarding.conversation_id, answer, idempotency_key: idempotencyKey })
        this.profile = this.onboarding.current_profile
        return this.onboarding
      } finally { this.saving = false }
    }
  }
})
