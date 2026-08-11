const { createHash, createHmac, randomUUID } = require('node:crypto')

const requireText = (value, code) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code)
  return value.trim()
}

function createAssessmentBff({
  repository,
  gateway,
  now = () => new Date().toISOString(),
  idFactory = randomUUID,
  consentVersion = 'mvp-consent-draft-v1',
  shareConsentVersion = 'mvp-share-consent-draft-v1',
  deletionConfirmationVersion = 'mvp-deletion-confirm-draft-v1',
  shareTokenSecret = 'local-test-share-token-secret',
  enforceConsent = true,
  fileVerifier = async ({ cloudFileId, task }) => cloudFileId.includes(`${task.privateUploadPath}.`),
  mediaAccessResolver = async () => null,
  fileDeleter = async () => ({ deleted: true }),
  quotaGuard = null
}) {
  const consentPurpose = 'practice_image_assessment'
  const sha256 = (value) => createHash('sha256').update(value).digest('hex')
  const shareToken = (shareCardId) => createHmac('sha256', shareTokenSecret)
    .update(`share-card\n${shareCardId}`).digest('base64url')
  const audit = (subjectId, eventType, resourceType, resourceId, occurredAt) => repository.appendAuditEvent({
    auditEventId: `audit_${idFactory()}`,
    subjectId,
    eventType,
    actorType: 'wechat_subject',
    resourceType,
    resourceIdHash: sha256(resourceId),
    occurredAt
  })
  const requireSubject = (context) => requireText(context?.subjectId, 'SUBJECT_REQUIRED')
  const requireActiveConsent = async (subjectId) => {
    if (!enforceConsent) return
    const activeConsent = await repository.getActiveConsent(subjectId, consentPurpose, consentVersion)
    if (!activeConsent) throw new Error('ACTIVE_GUARDIAN_CONSENT_REQUIRED')
  }
  const ownedTask = async (taskId, subjectId) => {
    const task = await repository.getTask(requireText(taskId, 'TASK_ID_REQUIRED'))
    if (!task) throw new Error('TASK_NOT_FOUND')
    if (task.subjectId !== subjectId) throw new Error('TASK_FORBIDDEN')
    return task
  }
  const startAssessment = async (task) => {
    try {
      const mediaAccess = task.cloudFileId
        ? await mediaAccessResolver({ cloudFileId: task.cloudFileId, task })
        : null
      await gateway.start({
        taskId: task.taskId,
        localTaskId: task.localTaskId,
        idempotencyKey: task.idempotencyKey,
        subjectId: task.subjectId,
        imageSha256: task.imageSha256,
        expectedText: task.expectedText,
        resultVersion: task.resultVersion,
        reassessmentOfTaskId: task.reassessmentOfTaskId,
        reassessmentReason: task.reassessmentReason,
        ...(mediaAccess ? { mediaAccess } : {})
      })
    } catch (error) {
      await repository.updateTask(task.taskId, {
        status: 'failed',
        progressStage: 'finished',
        retryable: true,
        errorCode: error.message,
        updatedAt: now()
      })
    }
  }
  const syncAssessment = async (task, subjectId) => {
    if (task.status !== 'analyzing') return task
    try {
      const remote = await gateway.get(task.taskId)
      if (['completed', 'partially_completed'].includes(remote.status)) {
        return repository.saveResult(task.taskId, { ...remote, subjectId, updatedAt: now() })
      }
      if (['failed', 'cancelled'].includes(remote.status)) {
        return repository.updateTask(task.taskId, {
          status: remote.status,
          progressStage: remote.progressStage ?? 'finished',
          retryable: remote.status === 'failed',
          errorCode: remote.errorCode ?? null,
          updatedAt: now()
        })
      }
      if (remote.progressStage && remote.progressStage !== task.progressStage) {
        return repository.updateTask(task.taskId, { progressStage: remote.progressStage, updatedAt: now() })
      }
      return task
    } catch (error) {
      if (String(error.message).includes('TASK_NOT_FOUND')) return task
      throw error
    }
  }

  return {
    async createUploadTask(input, context) {
      const subjectId = requireSubject(context)
      const localTaskId = requireText(input.localTaskId, 'LOCAL_TASK_ID_REQUIRED')
      const idempotencyKey = requireText(input.idempotencyKey, 'IDEMPOTENCY_KEY_REQUIRED')
      const expectedText = requireText(input.expectedText, 'EXPECTED_TEXT_REQUIRED')
      const requestedConsentVersion = requireText(input.consentVersion, 'CONSENT_VERSION_REQUIRED')
      if (requestedConsentVersion !== consentVersion) throw new Error('CONSENT_VERSION_MISMATCH')
      await requireActiveConsent(subjectId)
      const existing = await repository.findByIdempotency(subjectId, idempotencyKey)
      if (existing) return existing
      if (quotaGuard) {
        const quota = quotaGuard.consume(subjectId, Date.parse(now()))
        if (!quota.allowed) {
          const error = new Error('SUBJECT_QUOTA_EXCEEDED')
          error.retryAfterMs = quota.retryAfterMs
          error.policyVersion = quota.policyVersion
          throw error
        }
      }
      const taskId = `task_${idFactory()}`
      const createdAt = now()
      const privateUploadPath = `practice/${subjectId}/${taskId}/source`
      return repository.createTask({
        taskId,
        subjectId,
        localTaskId,
        idempotencyKey,
        expectedText,
        consentVersion,
        status: 'uploading',
        progressStage: null,
        resultVersion: 1,
        retryable: true,
        privateUploadPath,
        uploadPolicy: {
          allowedExtensions: ['jpg', 'jpeg', 'png'],
          maxBytes: 15 * 1024 * 1024,
          expiresAt: new Date(Date.parse(createdAt) + (15 * 60 * 1000)).toISOString()
        },
        createdAt,
        updatedAt: createdAt
      })
    },

    async getConsentStatus(_input, context) {
      const subjectId = requireSubject(context)
      const record = await repository.getConsentStatus(subjectId, consentPurpose)
      return {
        consentVersion,
        active: record?.decision === 'granted' && record.consentVersion === consentVersion,
        decision: record?.decision ?? 'not_recorded',
        recordedAt: record?.recordedAt ?? null
      }
    },

    async recordConsent(input, context) {
      const subjectId = requireSubject(context)
      if (input.privacyNoticeRead !== true || input.guardianConfirmed !== true) {
        throw new Error('CONSENT_CONFIRMATION_INCOMPLETE')
      }
      if (input.consentVersion !== consentVersion) throw new Error('CONSENT_VERSION_MISMATCH')
      const recordedAt = now()
      const record = await repository.recordConsent({
        consentRecordId: `consent_${idFactory()}`,
        subjectId,
        purpose: consentPurpose,
        consentVersion,
        decision: 'granted',
        actorType: 'guardian_self_asserted',
        recordedAt
      })
      return { consentVersion, active: true, decision: record.decision, recordedAt }
    },

    async withdrawConsent(input, context) {
      const subjectId = requireSubject(context)
      const latest = await repository.getConsentStatus(subjectId, consentPurpose)
      if (latest?.decision === 'revoked') {
        return { consentVersion, active: false, decision: 'revoked', recordedAt: latest.recordedAt }
      }
      const recordedAt = now()
      await repository.recordConsent({
        consentRecordId: `consent_${idFactory()}`,
        subjectId,
        purpose: consentPurpose,
        consentVersion,
        decision: 'revoked',
        actorType: 'guardian_self_asserted',
        reasonCode: input.reasonCode ?? 'user_withdrawal',
        recordedAt
      })
      return { consentVersion, active: false, decision: 'revoked', recordedAt }
    },

    async submitAssessment(input, context) {
      const subjectId = requireSubject(context)
      await requireActiveConsent(subjectId)
      const task = await ownedTask(input.taskId, subjectId)
      if (['completed', 'partially_completed', 'cancelled'].includes(task.status)) return task
      if (task.submittedAt) return task
      const cloudFileId = requireText(input.cloudFileId, 'CLOUD_FILE_ID_REQUIRED')
      if (!(await fileVerifier({ cloudFileId, task }))) throw new Error('CLOUD_FILE_OWNERSHIP_INVALID')
      if (Date.parse(now()) > Date.parse(task.uploadPolicy.expiresAt)) throw new Error('UPLOAD_TICKET_EXPIRED')
      const imageSha256 = requireText(input.imageSha256, 'IMAGE_SHA256_REQUIRED')
      if (!/^[a-f0-9]{64}$/.test(imageSha256)) throw new Error('IMAGE_SHA256_INVALID')
      const analyzing = await repository.updateTask(task.taskId, {
        cloudFileId,
        imageSha256,
        status: 'analyzing',
        progressStage: 'quality_checking',
        submittedAt: now(),
        updatedAt: now()
      })
      await startAssessment(analyzing)
      return analyzing
    },

    async retryAssessment(input, context) {
      const subjectId = requireSubject(context)
      await requireActiveConsent(subjectId)
      const task = await ownedTask(input.taskId, subjectId)
      if (['completed', 'partially_completed', 'cancelled', 'analyzing'].includes(task.status)) return task
      if (task.status !== 'failed' || task.retryable !== true || !task.cloudFileId || !task.imageSha256) {
        throw new Error('TASK_NOT_RETRYABLE')
      }
      const analyzing = await repository.updateTask(task.taskId, {
        status: 'analyzing',
        progressStage: 'quality_checking',
        retryCount: (task.retryCount ?? 0) + 1,
        errorCode: null,
        updatedAt: now()
      })
      await startAssessment(analyzing)
      return analyzing
    },

    async getAssessment(input, context) {
      const subjectId = requireSubject(context)
      const task = await ownedTask(input.taskId, subjectId)
      return syncAssessment(task, subjectId)
    },

    async getWordbook(input, context) {
      const subjectId = requireSubject(context)
      const filter = input.filter ?? 'all'
      if (!['all', 'wrong', 'correction', 'monitoring'].includes(filter)) throw new Error('WORDBOOK_FILTER_INVALID')
      return { entries: await repository.getWordbookEntries(subjectId, filter) }
    },

    async getCharacterGrowth(input, context) {
      const subjectId = requireSubject(context)
      const character = requireText(input.character, 'CHARACTER_REQUIRED')
      if ([...character].length !== 1) throw new Error('CHARACTER_INVALID')
      const growth = await repository.getCharacterGrowth(subjectId, character)
      if (!growth) throw new Error('CHARACTER_GROWTH_NOT_FOUND')
      return growth
    },

    async submitStudentFeedback(input, context) {
      const subjectId = requireSubject(context)
      await requireActiveConsent(subjectId)
      const feedbackIdempotencyKey = requireText(
        input.feedbackIdempotencyKey, 'FEEDBACK_IDEMPOTENCY_KEY_REQUIRED'
      )
      const existing = await repository.findFeedbackByIdempotency(subjectId, feedbackIdempotencyKey)
      if (existing) return existing
      const original = await ownedTask(input.taskId, subjectId)
      if (!['completed', 'partially_completed'].includes(original.status)) {
        throw new Error('FEEDBACK_REQUIRES_COMPLETED_RESULT')
      }
      const characterIndex = Number(input.characterIndex)
      if (!Number.isInteger(characterIndex) || characterIndex < 0) throw new Error('CHARACTER_INDEX_INVALID')
      const character = original.characters?.find((item) => item.index === characterIndex)
      if (!character) throw new Error('CHARACTER_RESULT_NOT_FOUND')
      const reasonCode = requireText(input.reasonCode, 'FEEDBACK_REASON_REQUIRED')
      if (!['recognition_incorrect', 'category_incorrect', 'score_incorrect', 'other'].includes(reasonCode)) {
        throw new Error('FEEDBACK_REASON_INVALID')
      }
      const note = typeof input.note === 'string' ? input.note.trim().slice(0, 200) : ''
      const createdAt = now()
      const feedbackId = `feedback_${idFactory()}`
      const reassessmentTaskId = `task_${idFactory()}`
      const reassessment = await repository.createTask({
        taskId: reassessmentTaskId,
        subjectId,
        localTaskId: `reassessment_${feedbackId}`,
        idempotencyKey: `reassessment:${feedbackIdempotencyKey}`,
        expectedText: original.expectedText,
        consentVersion,
        status: 'analyzing',
        progressStage: 'quality_checking',
        resultVersion: 1,
        retryable: true,
        cloudFileId: original.cloudFileId,
        imageSha256: original.imageSha256,
        submittedAt: createdAt,
        reassessmentOfTaskId: original.taskId,
        reassessmentReason: reasonCode,
        createdAt,
        updatedAt: createdAt
      })
      const record = await repository.createFeedback({
        feedbackId,
        subjectId,
        feedbackIdempotencyKey,
        originalTaskId: original.taskId,
        originalResultVersion: original.resultVersion,
        characterIndex,
        expectedCharacter: character.expectedCharacter,
        reasonCode,
        note,
        reassessmentTaskId: reassessment.taskId,
        createdAt
      })
      if (record.feedbackId === feedbackId) await startAssessment(reassessment)
      return record
    },

    async getFeedbackRecords(_input, context) {
      return { entries: await repository.getFeedbackRecords(requireSubject(context)) }
    },

    async createShareCard(input, context) {
      const subjectId = requireSubject(context)
      await requireActiveConsent(subjectId)
      const shareIdempotencyKey = requireText(input.shareIdempotencyKey, 'SHARE_IDEMPOTENCY_KEY_REQUIRED')
      if (input.shareConsentVersion !== shareConsentVersion || input.guardianConfirmed !== true) {
        throw new Error('SHARE_GUARDIAN_CONFIRMATION_REQUIRED')
      }
      const existing = await repository.findShareByIdempotency(subjectId, shareIdempotencyKey)
      if (existing) return {
        shareCardId: existing.shareCardId,
        shareToken: shareToken(existing.shareCardId),
        expiresAt: existing.expiresAt,
        preview: existing.redactedPayload
      }
      const task = await ownedTask(input.taskId, subjectId)
      if (!['completed', 'partially_completed'].includes(task.status)) throw new Error('SHARE_REQUIRES_RESULT')
      const createdAt = now()
      const shareCardId = `share_${idFactory()}`
      const token = shareToken(shareCardId)
      const confirmation = await repository.recordConsent({
        consentRecordId: `consent_${idFactory()}`,
        subjectId,
        purpose: 'share_card',
        consentVersion: shareConsentVersion,
        decision: 'granted',
        actorType: 'guardian_self_asserted',
        recordedAt: createdAt
      })
      const redactedPayload = {
        productName: '字有方',
        targetText: task.expectedText,
        resultStatus: task.status,
        summary: task.summary,
        characters: (task.characters ?? []).map((character) => ({
          expectedCharacter: character.expectedCharacter,
          category: character.category,
          score: character.score,
          advice: character.correctionSteps?.slice(0, 1) ?? []
        }))
      }
      const card = await repository.createShareCard({
        shareCardId,
        subjectId,
        shareIdempotencyKey,
        sourceTaskId: task.taskId,
        shareTokenHash: sha256(token),
        consentRecordId: confirmation.consentRecordId,
        shareConsentVersion,
        redactedPayload,
        status: 'active',
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + (7 * 24 * 60 * 60 * 1000)).toISOString(),
        revokedAt: null
      })
      await audit(subjectId, 'share_created', 'share_card', card.shareCardId, createdAt)
      return { shareCardId: card.shareCardId, shareToken: token, expiresAt: card.expiresAt, preview: redactedPayload }
    },

    async getSharedCard(input) {
      const token = requireText(input.shareToken, 'SHARE_TOKEN_REQUIRED')
      const card = await repository.getShareCardByTokenHash(sha256(token))
      if (!card || card.status !== 'active') throw new Error('SHARE_CARD_UNAVAILABLE')
      if (Date.parse(now()) >= Date.parse(card.expiresAt)) {
        await repository.updateShareCard(card.shareCardId, { status: 'expired' })
        throw new Error('SHARE_CARD_UNAVAILABLE')
      }
      return { status: 'active', expiresAt: card.expiresAt, payload: card.redactedPayload }
    },

    async revokeShareCard(input, context) {
      const subjectId = requireSubject(context)
      const card = await repository.getShareCard(requireText(input.shareCardId, 'SHARE_CARD_ID_REQUIRED'))
      if (!card) throw new Error('SHARE_CARD_NOT_FOUND')
      if (card.subjectId !== subjectId) throw new Error('SHARE_CARD_FORBIDDEN')
      if (card.status === 'revoked') return card
      const revokedAt = now()
      const revoked = await repository.updateShareCard(card.shareCardId, {
        status: 'revoked', revokedAt
      })
      await audit(subjectId, 'share_revoked', 'share_card', card.shareCardId, revokedAt)
      return revoked
    },

    async deletePractice(input, context) {
      const subjectId = requireSubject(context)
      const requestId = requireText(input.requestId, 'DELETION_REQUEST_ID_REQUIRED')
      if (input.confirmed !== true || input.confirmationVersion !== deletionConfirmationVersion) {
        throw new Error('DELETION_CONFIRMATION_REQUIRED')
      }
      const existing = await repository.findDeletionByRequest(subjectId, requestId)
      if (existing) return existing
      const task = await ownedTask(input.taskId, subjectId)
      if (task.status === 'analyzing') {
        const remote = await gateway.cancel(task.taskId)
        if (['completed', 'partially_completed'].includes(remote.status)) {
          await repository.saveResult(task.taskId, { ...remote, subjectId, updatedAt: now() })
        }
      }
      const requestedAt = now()
      const deletionJobId = `deletion_${idFactory()}`
      await repository.createDeletionJob({
        deletionJobId,
        subjectId,
        requestId,
        scope: { type: 'practice', taskId: task.taskId },
        status: 'processing',
        objectResults: [],
        requestedAt,
        completedAt: null
      })
      try {
        const fileIds = task.cloudFileId ? [task.cloudFileId] : []
        if (fileIds.length) await fileDeleter(fileIds)
        const removed = await repository.deletePracticeData(subjectId, task.taskId, now())
        const objectResults = [
          { objectType: 'private_media', status: 'deleted', count: fileIds.length },
          { objectType: 'assessment_tasks', status: 'deleted', count: removed.counts.assessmentTasks },
          { objectType: 'character_results', status: 'deleted', count: removed.counts.characterResults },
          { objectType: 'wordbook_growth', status: 'rebuilt', count: removed.counts.affectedCharacters },
          { objectType: 'feedback_records', status: 'deleted', count: removed.counts.feedbackRecords ?? null },
          { objectType: 'share_cards', status: 'deleted', count: removed.counts.shareCards ?? null }
        ]
        const completedAt = now()
        const job = await repository.updateDeletionJob(deletionJobId, {
          status: 'completed', objectResults, completedAt
        })
        await audit(subjectId, 'practice_deleted', 'assessment_task', task.taskId, completedAt)
        return job
      } catch (error) {
        return repository.updateDeletionJob(deletionJobId, {
          status: 'failed',
          errorCode: error.message,
          completedAt: now()
        })
      }
    },

    async getDeletionJobs(_input, context) {
      return { entries: await repository.getDeletionJobs(requireSubject(context)) }
    },

    async cancelAssessment(input, context) {
      const subjectId = requireSubject(context)
      const task = await ownedTask(input.taskId, subjectId)
      if (['completed', 'partially_completed', 'cancelled'].includes(task.status)) return task
      if (task.status === 'analyzing') {
        const remote = await gateway.cancel(task.taskId)
        if (['completed', 'partially_completed'].includes(remote.status)) {
          return repository.saveResult(task.taskId, { ...remote, subjectId, updatedAt: now() })
        }
        if (remote.status === 'failed') {
          return repository.updateTask(task.taskId, {
            status: 'failed',
            progressStage: remote.progressStage ?? 'finished',
            retryable: remote.retryable ?? true,
            errorCode: remote.errorCode ?? null,
            updatedAt: now()
          })
        }
      }
      return repository.updateTask(task.taskId, {
        status: 'cancelled',
        progressStage: 'finished',
        updatedAt: now()
      })
    }
  }
}

module.exports = { createAssessmentBff }
