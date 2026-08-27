export type TaskStatus =
  | 'pending_local'
  | 'uploading'
  | 'analyzing'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled'

export type CharacterCategory = 'normal' | 'wrong' | 'needs_correction' | 'uncertain' | 'failed'
export type SupportedImageFormat = 'jpeg' | 'png'

export interface UploadTicket {
  taskId: string
  mediaId: string
  expiresAt: string
  uploadUrl: string
  formFields: Record<string, string>
}

export interface ScoreBreakdown {
  strokeStandard: number | null
  frameStructure: number | null
  glyphProportion: number | null
  positionLayout: number | null
  stability: number | null
}

export interface DifferenceAnnotation {
  code: string
  anchor: 'top' | 'right' | 'bottom' | 'left' | 'center' | 'edge'
  label: string
}

export interface CharacterResult {
  index: number
  expectedCharacter: string
  recognizedCharacter: string | null
  polygon?: Array<{ x: number; y: number }>
  category: CharacterCategory
  score: number | null
  scoreBreakdown: ScoreBreakdown
  issues: Array<string | { code: string; title: string; detail: string }>
  differenceAnnotations: DifferenceAnnotation[]
  correctionSteps: string[]
  growthSummary?: GrowthSummary
}

export interface GrowthSummary {
  status: 'collecting' | 'available' | 'version_break'
  comparablePracticeCount: number
  requiredPracticeCount: number
  recentAverage: number | null
  stabilityScore: number | null
  monitoringStatus: 'not_eligible' | 'monitoring' | 'recovered'
  monitoringReasonCodes: Array<'LOW_RECENT_AVERAGE' | 'LOW_STABILITY'>
}

export interface GrowthPoint {
  practiceId: string
  sequence: number
  assessedAt: string
  totalScore: number
  dimensions: ScoreBreakdown
}

export interface CharacterGrowth extends GrowthSummary {
  studentCharacterId: string
  character: string
  monitoring: {
    status: GrowthSummary['monitoringStatus']
    reasonCodes: GrowthSummary['monitoringReasonCodes']
    enterThreshold: number
    exitThreshold: number
    ruleVersion: string
    enteredAt: string | null
    exitedAt: string | null
  }
  segments: Array<{
    scoreVersion: string
    glyphVersion: string
    points: GrowthPoint[]
  }>
}

export interface WordbookEntry {
  wordbookEntryId: string
  targetCharacter: string
  currentCategory: CharacterCategory
  latestScore: number | null
  practiceCount: number
  monitoringStatus: GrowthSummary['monitoringStatus']
  monitoringReasonCodes: GrowthSummary['monitoringReasonCodes']
  recentAverage: number | null
  stabilityScore: number | null
  requiredPracticeCount: number
  updatedAt: string
}

export interface FeedbackRecord {
  feedbackId: string
  feedbackIdempotencyKey: string
  originalTaskId: string
  originalResultVersion: number
  characterIndex: number
  expectedCharacter: string
  reasonCode: 'recognition_incorrect' | 'category_incorrect' | 'score_incorrect' | 'other'
  note: string
  reassessmentTaskId: string
  createdAt: string
}

export interface RedactedSharePayload {
  productName: string
  targetText: string
  resultStatus: 'completed' | 'partially_completed'
  summary: AssessmentTask['summary']
  characters: Array<{
    expectedCharacter: string
    category: CharacterCategory
    score: number | null
    advice: string[]
  }>
}

export interface ShareCardResult {
  shareCardId: string
  shareToken: string
  expiresAt: string
  preview: RedactedSharePayload
}

export interface DeletionJob {
  deletionJobId: string
  requestId: string
  scope: { type: 'practice'; taskId: string }
  status: 'processing' | 'completed' | 'failed'
  objectResults: Array<{ objectType: string; status: string; count: number | null }>
  requestedAt: string
  completedAt: string | null
  errorCode?: string
}

export interface AssessmentTask {
  taskId: string
  localTaskId: string
  idempotencyKey: string
  expectedText?: string
  status: TaskStatus
  progressStage: string | null
  retryable?: boolean
  errorCode?: string | null
  characters?: CharacterResult[]
  summary?: {
    total: number
    normal: number
    wrong: number
    needsCorrection: number
    uncertain: number
    failed: number
  }
}

export interface CaptureDraft {
  localTaskId: string
  idempotencyKey: string
  expectedText: string
  savedFilePath: string
  size: number
  imageWidth: number
  imageHeight: number
  mediaFormat: SupportedImageFormat
  createdAt: string
}

export interface LocalPendingTask {
  localTaskId: string
  idempotencyKey: string
  expectedText: string
  savedFilePath: string
  imageWidth: number
  imageHeight: number
  mediaFormat: SupportedImageFormat
  status: 'pending_local'
  createdAt: string
}

export interface TaskMediaBinding {
  taskId: string
  sourceTaskId: string
  parentTaskId?: string
  localTaskId: string
  savedFilePath: string
  imageWidth: number
  imageHeight: number
  mediaFormat: SupportedImageFormat
  createdAt: string
  expiresAt: string
}
