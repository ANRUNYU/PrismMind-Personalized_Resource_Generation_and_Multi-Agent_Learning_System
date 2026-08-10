import { defineStore } from 'pinia'

import {
  askTutoring,
  explainConcept,
  getTutoringHint,
  getTutoringSessions,
  rateTutoringSession,
  type TutoringAskRequest,
  type TutoringExplainRequest,
  type TutoringHintRequest,
  type TutoringReference,
  type TutoringResponse,
  type TutoringMode,
  type TutoringSession,
  type TutoringRatingRequest
} from '@/api/tutoring'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  references?: TutoringReference[]
  sessionId?: number
  loading?: boolean
}

export const useTutoringStore = defineStore('tutoring', {
  state: () => ({
    sessions: [] as TutoringSession[],
    total: 0,
    currentMessages: [] as ChatMessage[],
    loading: false,
    sessionsLoading: false
  }),
  actions: {
    clear() {
      this.currentMessages = []
    },
    async fetchSessions(params?: { page?: number; page_size?: number; session_type?: TutoringMode | ''; topic?: string }) {
      this.sessionsLoading = true
      try {
        const data = await getTutoringSessions(params)
        this.sessions = data.items
        this.total = data.total
        return data
      } finally {
        this.sessionsLoading = false
      }
    },
    async ask(payload: TutoringAskRequest) {
      return this.runConversation(payload.question, () => askTutoring(payload), 'answer')
    },
    async hint(payload: TutoringHintRequest) {
      return this.runConversation(payload.question, () => getTutoringHint(payload), 'hint')
    },
    async explain(payload: TutoringExplainRequest) {
      return this.runConversation(payload.concept, () => explainConcept(payload), 'explanation')
    },
    async runConversation(
      userContent: string,
      requestRunner: () => Promise<TutoringResponse>,
      contentKey: 'answer' | 'hint' | 'explanation'
    ) {
      const pendingId = crypto.randomUUID()
      this.currentMessages.push({ id: crypto.randomUUID(), role: 'user', content: userContent })
      this.currentMessages.push({ id: pendingId, role: 'assistant', content: 'Thinking...', loading: true })
      this.loading = true
      try {
        const response = await requestRunner()
        const content = response[contentKey] || ''
        this.currentMessages = this.currentMessages.map((message) =>
          message.id === pendingId
            ? {
                id: pendingId,
                role: 'assistant',
                content,
                references: response.references,
                sessionId: response.session_id,
                loading: false
              }
            : message
        )
        await this.fetchSessions()
        return response
      } finally {
        this.loading = false
      }
    },
    previewSession(session: TutoringSession) {
      this.currentMessages = [
        { id: `session-${session.id}-user`, role: 'user', content: session.user_question },
        {
          id: `session-${session.id}-assistant`,
          role: 'assistant',
          content: session.ai_response,
          references: session.context_refs,
          sessionId: session.id
        }
      ]
    },
    async rateSession(sessionId: number, payload: TutoringRatingRequest) {
      const data = await rateTutoringSession(sessionId, payload)
      await this.fetchSessions()
      return data
    }
  }
})
