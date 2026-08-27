const express = require('express')
const { deriveSubjectId, deriveWechatSubjectKey } = require('../../cloudfunctions/assessmentBff/core/identity')
const { createAssessmentBff } = require('../../cloudfunctions/assessmentBff/core/bff-core')
const { assertProductionSecrets } = require('../../cloudfunctions/assessmentBff/core/secret-policy')

const ACTIONS = new Set([
  'createUploadTask', 'submitAssessment', 'retryAssessment', 'getAssessment', 'cancelAssessment',
  'getWordbook', 'getCharacterGrowth', 'getConsentStatus', 'recordConsent', 'withdrawConsent',
  'submitStudentFeedback', 'getFeedbackRecords', 'createShareCard', 'getSharedCard',
  'revokeShareCard', 'deletePractice', 'getDeletionJobs'
])

const bearer = (request) => {
  const value = request.headers.authorization
  return value?.startsWith('Bearer ') ? value.slice(7).trim() : null
}

function statusFor(error) {
  const code = String(error?.message ?? '')
  if (/REQUIRED|INVALID|MISMATCH|INCOMPLETE/.test(code)) return 400
  if (/SESSION|IDENTITY/.test(code)) return 401
  if (/FORBIDDEN|OWNERSHIP/.test(code)) return 403
  if (/NOT_FOUND/.test(code)) return 404
  if (/QUOTA/.test(code)) return 429
  if (/UNAVAILABLE|UPSTREAM|FAILED/.test(code)) return 503
  return 409
}

function createApiApp({
  config, repository, queue, quotaGuard, sessions, wechat, media, pool,
  now = () => new Date().toISOString()
}) {
  if (config.nodeEnv === 'production') assertProductionSecrets({
    SUBJECT_ID_HMAC_SECRET: config.secrets.subjectId,
    SHARE_TOKEN_SECRET: config.secrets.shareToken,
    BFF_HMAC_SECRET: config.secrets.bffHmac
  })
  const gateway = {
    start: (task) => queue.enqueue(task),
    get: (taskId) => repository.getTask(taskId),
    async cancel(taskId) {
      await queue.cancel(taskId)
      const task = await repository.getTask(taskId)
      return { ...task, status: 'cancelled', progressStage: 'finished' }
    }
  }
  const bff = createAssessmentBff({
    repository,
    gateway,
    consentVersion: config.versions.consent,
    shareConsentVersion: config.versions.shareConsent,
    deletionConfirmationVersion: config.versions.deletionConfirmation,
    shareTokenSecret: config.secrets.shareToken,
    enforceConsent: true,
    quotaGuard,
    submissionAcceptor: (submission) => repository.acceptSubmission({
      ...submission,
      enqueue: (task, connection) => queue.enqueue(task, connection)
    }),
    fileVerifier: (input) => media.verifyUpload(input),
    mediaAccessResolver: async ({ cloudFileId }) => media.createAccess(cloudFileId),
    fileDeleter: async (refs) => {
      for (const ref of refs) await media.delete(ref)
      return { deleted: true }
    }
  })
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  const health = async (_request, response) => {
    try {
      await pool.query('SELECT 1')
      response.status(200).json({ status: 'ok', database: 'ready' })
    } catch {
      response.status(503).json({ status: 'not_ready', database: 'unavailable' })
    }
  }
  app.get('/health', health)
  app.get('/api/v1/health', health)

  app.post('/api/v1/auth/wechat', async (request, response, next) => {
    try {
      const identity = await wechat.exchange(request.body?.code)
      const subjectId = deriveSubjectId(identity.openid, config.secrets.subjectId)
      const occurredAt = now()
      await repository.upsertSubjectAccount({
        subjectId,
        wechatSubjectKey: deriveWechatSubjectKey(identity.openid, config.secrets.subjectId),
        status: 'active', createdAt: occurredAt, updatedAt: occurredAt
      })
      response.status(200).json(await sessions.issue(subjectId))
    } catch (error) { next(error) }
  })

  const authenticate = async (request, _response, next) => {
    try {
      const session = await sessions.resolve(bearer(request))
      if (!session) throw new Error('SESSION_INVALID_OR_EXPIRED')
      request.auth = session
      next()
    } catch (error) { next(error) }
  }

  app.post('/api/v1/actions', authenticate, async (request, response, next) => {
    try {
      const action = request.body?.action
      if (!ACTIONS.has(action)) throw new Error('ACTION_NOT_SUPPORTED')
      if (action === 'getSharedCard') throw new Error('PUBLIC_SHARE_ENDPOINT_REQUIRED')
      const result = await bff[action](request.body?.payload ?? {}, { subjectId: request.auth.subjectId })
      response.status(200).json(result)
    } catch (error) { next(error) }
  })

  app.post('/api/v1/media/upload-ticket', authenticate, async (request, response, next) => {
    try {
      const task = await repository.getTask(request.body?.taskId)
      if (!task) throw new Error('TASK_NOT_FOUND')
      response.status(200).json(await media.createUploadTicket({
        task, subjectId: request.auth.subjectId, extension: request.body?.extension
      }))
    } catch (error) { next(error) }
  })

  app.get('/api/v1/media/:mediaId/access', authenticate, async (request, response, next) => {
    try {
      const object = await repository.getMediaObject(request.params.mediaId)
      if (!object) throw new Error('MEDIA_NOT_FOUND')
      if (object.subjectId !== request.auth.subjectId) throw new Error('MEDIA_FORBIDDEN')
      if (object.lifecycleStatus !== 'active' || Date.parse(object.expiresAt) <= Date.now()) {
        throw new Error('MEDIA_UNAVAILABLE')
      }
      response.status(200).json(await media.createAccess(object.privateObjectRef))
    } catch (error) { next(error) }
  })

  app.get('/api/v1/share-cards/:shareToken', async (request, response, next) => {
    try {
      response.status(200).json(await bff.getSharedCard({ shareToken: request.params.shareToken }))
    } catch (error) { next(error) }
  })

  app.use((error, _request, response, _next) => {
    const code = String(error?.message ?? 'INTERNAL_ERROR').replace(/[^A-Z0-9_]/g, '_').slice(0, 128)
    const payload = { error: code || 'INTERNAL_ERROR' }
    if (error?.retryAfterMs) payload.retryAfterMs = error.retryAfterMs
    response.status(statusFor(error)).json(payload)
  })
  return app
}

module.exports = { createApiApp }
