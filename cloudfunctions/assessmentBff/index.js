const cloud = require('wx-server-sdk')

const { createAssessmentBff } = require('./core/bff-core')
const { createCloudRepository } = require('./core/cloud-repository')
const { CloudSlidingWindowQuota } = require('./core/cloud-quota-guard')
const { FixtureGateway } = require('./core/fixture-gateway')
const { deriveSubjectId, deriveWechatSubjectKey } = require('./core/identity')
const { createPrivateMediaAccessResolver } = require('./core/private-media-access')
const { RemoteAssessmentGateway } = require('./core/remote-gateway')
const { SlidingWindowQuota } = require('./core/quota-guard')
const { assertProductionSecrets } = require('./core/secret-policy')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const database = cloud.database()
const repository = createCloudRepository(database)
const quotaPolicyVersion = process.env.QUOTA_POLICY_VERSION ?? 'draft-quota-v1'
const quotaConfig = {
  windowMs: Number(process.env.QUOTA_WINDOW_MS ?? 60 * 60 * 1000),
  maximum: Number(process.env.QUOTA_MAX_TASKS ?? 30),
  policyVersion: quotaPolicyVersion
}
const quotaGuard = process.env.QUOTA_BACKEND === 'distributed'
  ? new CloudSlidingWindowQuota({ db: database, ...quotaConfig })
  : new SlidingWindowQuota(quotaConfig)

const verifyCloudFile = async ({ cloudFileId, task }) => {
  if (!cloudFileId.includes(`${task.privateUploadPath}.`)) return false
  const result = await cloud.getTempFileURL({ fileList: [cloudFileId] })
  const file = result.fileList?.[0]
  return file?.fileID === cloudFileId && file.status === 0
}

const resolvePrivateMediaAccess = createPrivateMediaAccessResolver({
  repository,
  getTempFileURL: (input) => cloud.getTempFileURL(input)
})

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
  if (process.env.NODE_ENV === 'production') {
    assertProductionSecrets({
      BFF_HMAC_SECRET: process.env.BFF_HMAC_SECRET,
      SUBJECT_ID_HMAC_SECRET: process.env.SUBJECT_ID_HMAC_SECRET,
      SHARE_TOKEN_SECRET: process.env.SHARE_TOKEN_SECRET
    })
  }
  const wxContext = cloud.getWXContext()
  const subjectId = deriveSubjectId(wxContext.OPENID, process.env.SUBJECT_ID_HMAC_SECRET)
  const occurredAt = new Date().toISOString()
  await repository.upsertSubjectAccount({
    subjectId,
    wechatSubjectKey: deriveWechatSubjectKey(wxContext.OPENID, process.env.SUBJECT_ID_HMAC_SECRET),
    status: 'active',
    createdAt: occurredAt,
    updatedAt: occurredAt
  })
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
