export interface LLMStatus {
  provider: string
  model: string
  real_provider_enabled: boolean
  fallback_enabled: boolean
  configured: boolean
  message: string
}
