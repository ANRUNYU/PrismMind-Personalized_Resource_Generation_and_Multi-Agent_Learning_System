import request from './request'

export interface RadarIndicator {
  name: string
  max: number
}

export interface RadarChartData {
  indicators: RadarIndicator[]
  values: number[]
}

export interface StudentProfileBase {
  major?: string | null
  grade?: string | null
  learning_goal?: string | null
  current_level?: string | null
  preferred_style?: string | null
  available_time_per_week?: number | null
  exam_pressure?: string | null
  practice_experience?: string | null
  weaknesses?: string[] | null
  interests?: string[] | null
}

export type StudentProfileCreate = StudentProfileBase
export type StudentProfileUpdate = StudentProfileBase

export interface StudentProfile extends StudentProfileBase {
  id: number
  user_id: number
  weaknesses: string[]
  interests: string[]
  knowledge_score: number
  practice_score: number
  innovation_score: number
  exam_score: number
  efficiency_score: number
  quality_score: number
  radar_chart_data: RadarChartData
  profile_summary?: string | null
  profile_data: Record<string, unknown>
  build_step: number
  is_complete: boolean
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  role: 'assistant' | 'user' | 'system'
  content: string
}

export interface ProfileConversationRequest {
  message: string
  conversation_history?: ConversationMessage[]
  apply?: boolean
}

export interface ProfileConversationResponse {
  analysis: string
  extracted_profile: Record<string, unknown>
  suggested_scores: Record<string, number>
  next_question?: string | null
  applied: boolean
  current_profile?: StudentProfile | null
}

export interface ProfileQuestion {
  step: number
  key: string
  question: string
}

export interface ProfileQuestionsResponse {
  questions: ProfileQuestion[]
}

export interface ProfileBuildRequest {
  step: number
  answer: string
}

export interface ProfileBuildResponse {
  step: number
  current_profile: StudentProfile
  next_question?: string | null
  is_complete: boolean
}

export interface ProfileScoreUpdate {
  knowledge_score: number
  practice_score: number
  innovation_score: number
  exam_score: number
  efficiency_score: number
  quality_score: number
}

export interface ProfileMessageRecord {
  id: number; role: string; step: string; content: string; question?: string | null; answer?: string | null
  extracted_fields: Record<string, unknown>; dimension_updates: Record<string, number>
  profile_before: Record<string, unknown>; profile_after: Record<string, unknown>; created_at: string
}

export interface ProfileOnboardingState {
  conversation_id: number; mode: 'onboarding' | 'continuous'; status: string; current_step: string; current_question: string
  messages: ProfileMessageRecord[]; current_profile: StudentProfile; changed_fields: string[]; changed_dimensions: string[]; duplicate: boolean
}

export function createProfile(payload: StudentProfileCreate) {
  return request.post<StudentProfile, StudentProfile>('/student/profile', payload)
}

export function getMyProfile() {
  return request.get<StudentProfile, StudentProfile>('/student/profile/me')
}

export function getMyProfileApi() {
  return getMyProfile()
}

export function updateProfile(payload: StudentProfileUpdate) {
  return request.patch<StudentProfile, StudentProfile>('/student/profile/me', payload)
}

export function analyzeProfileConversation(payload: ProfileConversationRequest) {
  return request.post<ProfileConversationResponse, ProfileConversationResponse>('/student/profile/conversations', payload)
}

export function getProfileQuestions() {
  return request.get<ProfileQuestionsResponse, ProfileQuestionsResponse>('/student/profile/questions')
}

export function buildProfileStep(payload: ProfileBuildRequest) {
  return request.post<ProfileBuildResponse, ProfileBuildResponse>('/student/profile/build', payload)
}

export function updateProfileScores(payload: ProfileScoreUpdate) {
  return request.patch<StudentProfile, StudentProfile>('/student/profile/scores', payload)
}

export function getProfileOnboarding() {
  return request.get<ProfileOnboardingState, ProfileOnboardingState>('/student/profile/onboarding')
}

export function answerProfileOnboarding(payload: { conversation_id: number; answer: string; idempotency_key: string }) {
  return request.post<ProfileOnboardingState, ProfileOnboardingState>('/student/profile/onboarding/messages', payload)
}

export function getProfileConversation(conversationId: number) {
  return request.get<ProfileOnboardingState, ProfileOnboardingState>(`/student/profile/conversations/${conversationId}`)
}
