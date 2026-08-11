export enum AssessmentTaskStatus {
  LOCAL_PENDING = 'local_pending',
  UPLOADING = 'uploading',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum CharacterCategory {
  NORMAL = 'normal',
  WRONG = 'wrong',
  UNATTRACTIVE = 'unattractive',
  UNCERTAIN = 'uncertain'
}

export class BoundingBox {
  x: number
  y: number
  width: number
  height: number

  constructor(x: number, y: number, width: number, height: number) {
    this.x = x
    this.y = y
    this.width = width
    this.height = height
  }
}

export class CorrectionIssue {
  id: string
  title: string
  description: string
  evidenceRegion: BoundingBox

  constructor(id: string, title: string, description: string, evidenceRegion: BoundingBox) {
    this.id = id
    this.title = title
    this.description = description
    this.evidenceRegion = evidenceRegion
  }
}

export class CharacterResult {
  index: number
  expectedCharacter: string
  recognizedCharacter: string
  cropUri: string
  standardGlyphVersion: string
  score?: number
  confidence: number
  category: CharacterCategory
  boundingBox: BoundingBox
  issues: CorrectionIssue[]
  suggestion: string

  constructor(index: number, expectedCharacter: string, recognizedCharacter: string,
    cropUri: string, standardGlyphVersion: string, score: number | undefined, confidence: number,
    category: CharacterCategory, boundingBox: BoundingBox, issues: CorrectionIssue[], suggestion: string) {
    this.index = index
    this.expectedCharacter = expectedCharacter
    this.recognizedCharacter = recognizedCharacter
    this.cropUri = cropUri
    this.standardGlyphVersion = standardGlyphVersion
    this.score = score
    this.confidence = confidence
    this.category = category
    this.boundingBox = boundingBox
    this.issues = issues
    this.suggestion = suggestion
  }
}

export class AssessmentTask {
  localTaskId: string
  idempotencyKey: string
  studentId: string
  imageUri: string
  expectedText: string
  status: AssessmentTaskStatus
  retryCount: number
  createdAt: number
  results: CharacterResult[]

  constructor(localTaskId: string, idempotencyKey: string, studentId: string, imageUri: string,
    expectedText: string, status: AssessmentTaskStatus, retryCount: number, createdAt: number,
    results: CharacterResult[]) {
    this.localTaskId = localTaskId
    this.idempotencyKey = idempotencyKey
    this.studentId = studentId
    this.imageUri = imageUri
    this.expectedText = expectedText
    this.status = status
    this.retryCount = retryCount
    this.createdAt = createdAt
    this.results = results
  }
}
