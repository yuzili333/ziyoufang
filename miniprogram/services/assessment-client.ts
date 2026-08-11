import type {
  AssessmentTask, CharacterGrowth, DeletionJob, FeedbackRecord, RedactedSharePayload,
  ShareCardResult, WordbookEntry
} from '../domain/types'

const call = async <T>(action: string, payload: Record<string, unknown>): Promise<T> => {
  const response = await wx.cloud.callFunction<T>({
    name: 'assessmentBff',
    data: { action, payload }
  })
  return response.result
}

export const CONSENT_VERSION = 'mvp-consent-draft-v1'
export const SHARE_CONSENT_VERSION = 'mvp-share-consent-draft-v1'
export const DELETION_CONFIRMATION_VERSION = 'mvp-deletion-confirm-draft-v1'

export interface ConsentStatus {
  consentVersion: string
  active: boolean
  decision: 'not_recorded' | 'granted' | 'revoked'
  recordedAt: string | null
}

export const AssessmentClient = {
  getConsentStatus() {
    return call<ConsentStatus>('getConsentStatus', {})
  },
  recordConsent() {
    return call<ConsentStatus>('recordConsent', {
      consentVersion: CONSENT_VERSION,
      privacyNoticeRead: true,
      guardianConfirmed: true
    })
  },
  withdrawConsent() {
    return call<ConsentStatus>('withdrawConsent', { reasonCode: 'user_withdrawal' })
  },
  createUploadTask(input: {
    localTaskId: string
    idempotencyKey: string
    expectedText: string
    consentVersion: string
  }) {
    return call<AssessmentTask>('createUploadTask', input)
  },
  submitAssessment(input: { taskId: string; cloudFileId: string; imageSha256: string }) {
    return call<AssessmentTask>('submitAssessment', input)
  },
  retryAssessment(taskId: string) {
    return call<AssessmentTask>('retryAssessment', { taskId })
  },
  getAssessment(taskId: string) {
    return call<AssessmentTask>('getAssessment', { taskId })
  },
  getWordbook(filter: 'all' | 'wrong' | 'correction' | 'monitoring') {
    return call<{ entries: WordbookEntry[] }>('getWordbook', { filter })
  },
  getCharacterGrowth(character: string) {
    return call<CharacterGrowth>('getCharacterGrowth', { character })
  },
  submitStudentFeedback(input: {
    taskId: string
    characterIndex: number
    feedbackIdempotencyKey: string
    reasonCode: FeedbackRecord['reasonCode']
    note: string
  }) {
    return call<FeedbackRecord>('submitStudentFeedback', input)
  },
  getFeedbackRecords() {
    return call<{ entries: FeedbackRecord[] }>('getFeedbackRecords', {})
  },
  createShareCard(input: { taskId: string; shareIdempotencyKey: string }) {
    return call<ShareCardResult>('createShareCard', {
      ...input,
      shareConsentVersion: SHARE_CONSENT_VERSION,
      guardianConfirmed: true
    })
  },
  getSharedCard(shareToken: string) {
    return call<{ status: 'active'; expiresAt: string; payload: RedactedSharePayload }>(
      'getSharedCard', { shareToken }
    )
  },
  revokeShareCard(shareCardId: string) {
    return call<{ status: 'revoked'; revokedAt: string }>('revokeShareCard', { shareCardId })
  },
  deletePractice(input: { taskId: string; requestId: string }) {
    return call<DeletionJob>('deletePractice', {
      ...input,
      confirmationVersion: DELETION_CONFIRMATION_VERSION,
      confirmed: true
    })
  },
  getDeletionJobs() {
    return call<{ entries: DeletionJob[] }>('getDeletionJobs', {})
  },
  cancelAssessment(taskId: string) {
    return call<AssessmentTask>('cancelAssessment', { taskId })
  }
}
