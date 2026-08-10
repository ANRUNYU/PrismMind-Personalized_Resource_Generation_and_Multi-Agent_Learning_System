export type QualityDepthLevel = 'basic' | 'intermediate' | 'advanced'
export type QualityConfidenceLevel = 'low' | 'medium' | 'high'

export interface EvidenceSource {
  source_type: string
  file_id?: number | null
  knowledge_document_id?: number | null
  chunk_id?: string | null
  source_hash?: string | null
  source_version?: string | null
  retrieval_similarity?: number | null
  reference_text: string
}

export interface KeypointMatch {
  keypoint: string
  evidence_chunk_id: string
  generated_section: string
  similarity: number
}

export interface QualityAnalysis {
  analysis_version?: string
  evidence_available?: boolean
  evidence_sources?: EvidenceSource[]
  evidence_chunk_ids?: string[]
  source_keypoints?: string[]
  matched_keypoints?: KeypointMatch[]
  missing_keypoints?: string[]
  source_coverage?: number | null
  source_match_rate?: number | null
  diagnostic_confidence?: number | null
  constraint_fulfillment?: number | null
  warnings?: string[]
  unavailable_reason?: string | null
  algorithm?: Record<string, unknown>
  coverage?: { expected_keywords: string[]; covered_keywords: string[]; missing_keywords: string[]; coverage_rate: number; explanation: string }
  depth?: { expected_depth: QualityDepthLevel; actual_depth: QualityDepthLevel; score: number; explanation: string; suggestions: string[] }
  confidence?: { level: QualityConfidenceLevel; score: number; explanation: string; factors: string[] }
  suggestions?: string[]
}
