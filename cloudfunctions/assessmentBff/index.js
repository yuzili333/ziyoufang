const cloud = require('wx-server-sdk')

const { createAssessmentBff } = require('./core/bff-core')
const { createCloudRepository } = require('./core/cloud-repository')
const { FixtureGateway } = require('./core/fixture-gateway')
const { deriveSubjectId } = require('./core/identity')
const { RemoteAssessmentGateway } = require('./core/remote-gateway')
const { SlidingWindowQuota } = require('./core/quota-guard')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const repository = createCloudRepository(cloud.database())
const quotaPolicyVersion = process.env.QUOTA_POLICY_VERSION ?? 'draft-quota-v1'
const quotaGuard = new SlidingWindowQuota({
  windowMs: Number(process.env.QUOTA_WINDOW_MS ?? 60 * 60 * 1000),
  maximum: Number(process.env.QUOTA_MAX_TASKS ?? 30),
  policyVersion: quotaPolicyVersion
})

const verifyCloudFile = async ({ cloudFileId, task }) => {
  if (!cloudFileId.includes(`${task.privateUploadPath}.`)) return false
  const result = await cloud.getTempFileURL({ fileList: [cloudFileId] })
  const file = result.fileList?.[0]
  return file?.fileID === cloudFileId && file.status === 0
}

const resolvePrivateMediaAccess = async ({ cloudFileId }) => {
  const result = await cloud.getTempFileURL({ fileList: [cloudFileId] })
  const file = result.fileList?.[0]
  if (file?.fileID !== cloudFileId || file.status !== 0 || !file.tempFileURL) {
    throw new Error('PRIVATE_MEDIA_ACCESS_UNAVAILABLE')
  }
  const url = new URL(file.tempFileURL)
  if (url.protocol !== 'https:') throw new Error('PRIVATE_MEDIA_ACCESS_INSECURE')
  return {
    url: url.toString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }
}

const deleteCloudFiles = async (fileList) => {
  if (fileList.length === 0) return { deleted: true }
  return cloud.deleteFile({ fileList })
}

const createGateway = () => {
  if (process.env.ASSESSMENT_GATEWAY_MODE === 'fixture') {
    if (process.env.NODE_ENV === 'production') throw new Error('FIXTURE_GATEWAY_FORBIDDEN_IN_PRODUCTION')
    return new FixtureGateway()
  }
  return new RemoteAssessmentGateway({
    baseUrl: process.env.ASSESSMENT_SERVICE_BASE_URL,
    secret: process.env.BFF_HMAC_SECRET
  })
}

exports.main = async (event) => {
  const consentVersion = process.env.CONSENT_VERSION ?? 'mvp-consent-draft-v1'
  const shareConsentVersion = process.env.SHARE_CONSENT_VERSION ?? 'mvp-share-consent-draft-v1'
  const deletionConfirmationVersion = process.env.DELETION_CONFIRMATION_VERSION ?? 'mvp-deletion-confirm-draft-v1'
  if (process.env.NODE_ENV === 'production' && consentVersion.includes('draft')) {
    throw new Error('PRODUCTION_CONSENT_VERSION_NOT_APPROVED')
  }
  if (process.env.NODE_ENV === 'production' && shareConsentVersion.includes('draft')) {
    throw new Error('PRODUCTION_SHARE_CONSENT_VERSION_NOT_APPROVED')
  }
  if (process.env.NODE_ENV === 'production' && !process.env.SHARE_TOKEN_SECRET) {
    throw new Error('SHARE_TOKEN_SECRET_REQUIRED')
  }
  if (process.env.NODE_ENV === 'production' && deletionConfirmationVersion.includes('draft')) {
    throw new Error('PRODUCTION_DELETION_CONFIRMATION_NOT_APPROVED')
  }
  if (process.env.NODE_ENV === 'production' && quotaPolicyVersion.includes('draft')) {
    throw new Error('PRODUCTION_QUOTA_POLICY_NOT_APPROVED')
  }
  if (process.env.NODE_ENV === 'production' && process.env.QUOTA_BACKEND !== 'distributed') {
    throw new Error('PRODUCTION_DISTRIBUTED_QUOTA_REQUIRED')
  }
  const wxContext = cloud.getWXContext()
  const subjectId = deriveSubjectId(wxContext.OPENID, process.env.SUBJECT_ID_HMAC_SECRET)
  const bff = createAssessmentBff({
    repository,
    gateway: createGateway(),
    consentVersion,
    shareConsentVersion,
    deletionConfirmationVersion,
    shareTokenSecret: process.env.SHARE_TOKEN_SECRET,
    enforceConsent: true,
    fileVerifier: verifyCloudFile,
    mediaAccessResolver: resolvePrivateMediaAccess,
    fileDeleter: deleteCloudFiles,
    quotaGuard
  })
  const action = event.action
  if (![
    'createUploadTask', 'submitAssessment', 'retryAssessment', 'getAssessment', 'cancelAssessment',
    'getWordbook', 'getCharacterGrowth', 'getConsentStatus', 'recordConsent', 'withdrawConsent',
    'submitStudentFeedback', 'getFeedbackRecords',
    'createShareCard', 'getSharedCard', 'revokeShareCard',
    'deletePractice', 'getDeletionJobs'
  ].includes(action)) {
    throw new Error('ACTION_NOT_SUPPORTED')
  }
  return bff[action](event.payload ?? {}, { subjectId })
}
