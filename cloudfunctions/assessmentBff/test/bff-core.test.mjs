import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createAssessmentBff } = require('../core/bff-core')
const { FixtureGateway } = require('../core/fixture-gateway')
const { MemoryBffRepository } = require('../core/memory-repository')
const { SlidingWindowQuota } = require('../core/quota-guard')

const input = {
  localTaskId: 'local-1',
  idempotencyKey: 'idem-1',
  expectedText: '永山月',
  consentVersion: 'consent-v1'
}
const context = { subjectId: 'subject-1' }
const cloudFile = (task) => `cloud://fixture/${task.privateUploadPath}.jpg`

const setup = () => {
  const repository = new MemoryBffRepository()
  const gateway = new FixtureGateway()
  const bff = createAssessmentBff({
    repository,
    gateway,
    idFactory: () => 'fixed-id',
    now: () => '2026-08-11T10:00:00.000Z',
    consentVersion: 'consent-v1',
    enforceConsent: false
  })
  return { repository, gateway, bff }
}

test('create task is idempotent and never trusts a client identity field', async () => {
  const { bff } = setup()
  const first = await bff.createUploadTask({ ...input, openid: 'attacker' }, context)
  const second = await bff.createUploadTask(input, context)
  assert.equal(first.taskId, 'task_fixed-id')
  assert.deepEqual(second, first)
  assert.equal(first.subjectId, 'subject-1')
  assert.equal(first.openid, undefined)
})

test('new logical tasks consume subject quota while idempotent retries do not', async () => {
  const repository = new MemoryBffRepository()
  const quotaGuard = new SlidingWindowQuota({ windowMs: 60_000, maximum: 2, policyVersion: 'quota-v1' })
  let id = 0
  const bff = createAssessmentBff({
    repository, gateway: new FixtureGateway(), enforceConsent: false,
    consentVersion: 'consent-v1', quotaGuard, idFactory: () => String(++id),
    now: () => '2026-08-11T10:00:00.000Z'
  })
  const first = await bff.createUploadTask(input, context)
  const duplicate = await bff.createUploadTask(input, context)
  assert.equal(duplicate.taskId, first.taskId)
  await bff.createUploadTask({ ...input, localTaskId: 'local-2', idempotencyKey: 'idem-2' }, context)
  await assert.rejects(
    bff.createUploadTask({ ...input, localTaskId: 'local-3', idempotencyKey: 'idem-3' }, context),
    (error) => error.message === 'SUBJECT_QUOTA_EXCEEDED'
      && error.retryAfterMs === 60_000
      && error.policyVersion === 'quota-v1'
  )
})

test('submit stores a partial multi-character result once', async () => {
  const { bff, gateway } = setup()
  const task = await bff.createUploadTask(input, context)
  const accepted = await bff.submitAssessment({
    taskId: task.taskId,
    cloudFileId: cloudFile(task),
    imageSha256: 'a'.repeat(64)
  }, context)
  assert.equal(accepted.status, 'analyzing')
  const result = await bff.getAssessment({ taskId: task.taskId }, context)
  assert.equal(result.status, 'partially_completed')
  assert.equal(result.characters.length, 5)
  await bff.submitAssessment({
    taskId: task.taskId,
    cloudFileId: cloudFile(task),
    imageSha256: 'a'.repeat(64)
  }, context)
  assert.equal(gateway.calls, 1)
})

test('BFF resolves a fresh private media grant for the remote call without persisting it', async () => {
  const repository = new MemoryBffRepository()
  let startedTask
  const gateway = {
    async start(task) { startedTask = structuredClone(task) },
    async get() { throw new Error('TASK_NOT_FOUND') },
    async cancel(taskId) { return { taskId, status: 'cancelled' } }
  }
  let accessCalls = 0
  const bff = createAssessmentBff({
    repository,
    gateway,
    consentVersion: 'consent-v1',
    enforceConsent: false,
    idFactory: () => 'media-access',
    now: () => '2026-08-11T10:00:00.000Z',
    mediaAccessResolver: async () => {
      accessCalls += 1
      return {
        url: 'https://private-media.example/source.jpg?temporary=secret',
        expiresAt: '2026-08-11T10:10:00.000Z'
      }
    }
  })
  const task = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: task.taskId,
    cloudFileId: cloudFile(task),
    imageSha256: 'a'.repeat(64)
  }, context)
  assert.equal(accessCalls, 1)
  assert.equal(startedTask.mediaAccess.url.includes('temporary=secret'), true)
  assert.equal(startedTask.cloudFileId, undefined)
  assert.equal(startedTask.privateUploadPath, undefined)
  assert.equal(startedTask.consentVersion, undefined)
  const persisted = await repository.getTask(task.taskId)
  assert.equal(persisted.mediaAccess, undefined)
  assert.equal(JSON.stringify(persisted).includes('private-media.example'), false)
})

test('task ownership is enforced', async () => {
  const { bff } = setup()
  const task = await bff.createUploadTask(input, context)
  await assert.rejects(
    bff.getAssessment({ taskId: task.taskId }, { subjectId: 'subject-2' }),
    /TASK_FORBIDDEN/
  )
})

test('submit rejects a cloud file outside the issued private upload path', async () => {
  const { bff } = setup()
  const task = await bff.createUploadTask(input, context)
  await assert.rejects(
    bff.submitAssessment({
      taskId: task.taskId,
      cloudFileId: 'cloud://fixture/practice/another-subject/other-task/source.jpg',
      imageSha256: 'a'.repeat(64)
    }, context),
    /CLOUD_FILE_OWNERSHIP_INVALID/
  )
})

test('cancelling a local upload is idempotent', async () => {
  const { bff } = setup()
  const task = await bff.createUploadTask(input, context)
  const first = await bff.cancelAssessment({ taskId: task.taskId }, context)
  const second = await bff.cancelAssessment({ taskId: task.taskId }, context)
  assert.equal(first.status, 'cancelled')
  assert.deepEqual(second, first)
})

test('cancel never overwrites a result that completed remotely first', async () => {
  const repository = new MemoryBffRepository()
  const fixtureGateway = new FixtureGateway()
  const gateway = {
    start: (task) => fixtureGateway.start(task),
    get: (taskId) => fixtureGateway.get(taskId),
    cancel: (taskId) => fixtureGateway.get(taskId)
  }
  const bff = createAssessmentBff({
    repository, gateway, consentVersion: 'consent-v1', enforceConsent: false,
    idFactory: () => 'cancel-race', now: () => '2026-08-11T10:00:00.000Z'
  })
  const task = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: task.taskId, cloudFileId: cloudFile(task), imageSha256: 'a'.repeat(64)
  }, context)
  const result = await bff.cancelAssessment({ taskId: task.taskId }, context)
  assert.equal(result.status, 'partially_completed')
  assert.equal(result.characters.length, 5)
})

test('problem characters are collected in the wordbook without fabricated stability', async () => {
  const { bff } = setup()
  const task = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: task.taskId,
    cloudFileId: cloudFile(task),
    imageSha256: 'a'.repeat(64)
  }, context)
  await bff.getAssessment({ taskId: task.taskId }, context)
  const wordbook = await bff.getWordbook({ filter: 'all' }, context)
  assert.deepEqual(wordbook.entries.map((entry) => entry.targetCharacter), ['山', '月'])
  assert.equal(wordbook.entries[0].practiceCount, 1)
  assert.equal(wordbook.entries[0].stabilityScore, null)
  assert.equal(wordbook.entries[0].requiredPracticeCount, 2)
  const growth = await bff.getCharacterGrowth({ character: '月' }, context)
  assert.equal(growth.status, 'collecting')
  assert.equal(growth.segments[0].points.length, 1)
})

test('wordbook and growth remain tenant isolated', async () => {
  const { bff } = setup()
  await assert.rejects(
    bff.getCharacterGrowth({ character: '月' }, { subjectId: 'subject-2' }),
    /CHARACTER_GROWTH_NOT_FOUND/
  )
  const wordbook = await bff.getWordbook({ filter: 'all' }, { subjectId: 'subject-2' })
  assert.deepEqual(wordbook.entries, [])
})

test('three comparable low practices move a problem character into monitoring', async () => {
  const repository = new MemoryBffRepository()
  const bff = createAssessmentBff({ repository, gateway: new FixtureGateway() })
  for (const [index, score] of [72, 68, 62].entries()) {
    const taskId = `task-growth-${index + 1}`
    await repository.createTask({
      taskId, subjectId: context.subjectId, localTaskId: `local-${index}`,
      idempotencyKey: `idem-${index}`, status: 'analyzing'
    })
    await repository.saveResult(taskId, {
      status: 'completed', progressStage: 'finished', resultVersion: 1,
      updatedAt: `2026-08-${String(index + 8).padStart(2, '0')}T10:00:00.000Z`,
      characters: [{
        index: 0, expectedCharacter: '月', category: 'needs_correction', score,
        scoreBreakdown: {
          strokeStandard: score, frameStructure: score, glyphProportion: score,
          positionLayout: score, stability: null
        },
        versions: { score: 'score-v1', glyph: 'glyph-v1' }
      }]
    })
  }
  const monitoring = await bff.getWordbook({ filter: 'monitoring' }, context)
  assert.equal(monitoring.entries.length, 1)
  assert.equal(monitoring.entries[0].targetCharacter, '月')
  assert.equal(monitoring.entries[0].recentAverage, 67)
  assert.equal(monitoring.entries[0].monitoringStatus, 'monitoring')
  const growth = await bff.getCharacterGrowth({ character: '月' }, context)
  assert.equal(growth.comparablePracticeCount, 3)
  assert.equal(growth.segments[0].points[2].dimensions.stability, growth.stabilityScore)
  assert.equal(repository.monitoringEvents.length, 1)
})

test('guardian confirmation is server-authoritative and withdrawal blocks new uploads', async () => {
  const repository = new MemoryBffRepository()
  let nextId = 0
  const bff = createAssessmentBff({
    repository,
    gateway: new FixtureGateway(),
    consentVersion: 'consent-v1',
    idFactory: () => String(++nextId),
    now: () => '2026-08-11T10:00:00.000Z'
  })
  await assert.rejects(bff.createUploadTask(input, context), /ACTIVE_GUARDIAN_CONSENT_REQUIRED/)
  await assert.rejects(
    bff.recordConsent({ consentVersion: 'consent-v1', privacyNoticeRead: true, guardianConfirmed: false }, context),
    /CONSENT_CONFIRMATION_INCOMPLETE/
  )
  const granted = await bff.recordConsent({
    consentVersion: 'consent-v1', privacyNoticeRead: true, guardianConfirmed: true
  }, context)
  assert.equal(granted.active, true)
  const task = await bff.createUploadTask(input, context)
  assert.equal(task.status, 'uploading')
  const withdrawn = await bff.withdrawConsent({}, context)
  assert.equal(withdrawn.active, false)
  await assert.rejects(
    bff.submitAssessment({
      taskId: task.taskId, cloudFileId: cloudFile(task), imageSha256: 'a'.repeat(64)
    }, context),
    /ACTIVE_GUARDIAN_CONSENT_REQUIRED/
  )
  await assert.rejects(
    bff.createUploadTask({ ...input, idempotencyKey: 'after-withdrawal' }, context),
    /ACTIVE_GUARDIAN_CONSENT_REQUIRED/
  )
})

test('a failed assessment can be retried from its persisted upload checkpoint', async () => {
  const repository = new MemoryBffRepository()
  let calls = 0
  let accessCalls = 0
  const fixtureGateway = new FixtureGateway()
  const gateway = {
    async start(task) {
      calls += 1
      if (calls === 1) throw new Error('TEMPORARY_PROVIDER_FAILURE')
      return fixtureGateway.start(task)
    },
    async get(taskId) { return fixtureGateway.get(taskId) },
    async cancel() {}
  }
  const bff = createAssessmentBff({
    repository, gateway, consentVersion: 'consent-v1', enforceConsent: false,
    idFactory: () => 'retry-id', now: () => '2026-08-11T10:00:00.000Z',
    mediaAccessResolver: async () => {
      accessCalls += 1
      return {
        url: `https://private-media.example/source.jpg?grant=${accessCalls}`,
        expiresAt: '2026-08-11T10:10:00.000Z'
      }
    }
  })
  const task = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: task.taskId, cloudFileId: cloudFile(task), imageSha256: 'a'.repeat(64)
  }, context)
  assert.equal((await bff.getAssessment({ taskId: task.taskId }, context)).status, 'failed')
  const accepted = await bff.retryAssessment({ taskId: task.taskId }, context)
  assert.equal(accepted.status, 'analyzing')
  const result = await bff.getAssessment({ taskId: task.taskId }, context)
  assert.equal(result.status, 'partially_completed')
  assert.equal(result.retryCount, 1)
  assert.equal(calls, 2)
  assert.equal(accessCalls, 2)
})

test('student feedback creates one traceable reassessment without mutating the original result', async () => {
  const repository = new MemoryBffRepository()
  const gateway = new FixtureGateway()
  let nextId = 0
  const bff = createAssessmentBff({
    repository, gateway, consentVersion: 'consent-v1', enforceConsent: false,
    idFactory: () => String(++nextId), now: () => '2026-08-11T10:00:00.000Z'
  })
  const originalTask = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: originalTask.taskId,
    cloudFileId: cloudFile(originalTask),
    imageSha256: 'a'.repeat(64)
  }, context)
  const original = await bff.getAssessment({ taskId: originalTask.taskId }, context)
  const originalSnapshot = structuredClone(original)
  const feedbackInput = {
    taskId: original.taskId,
    characterIndex: 1,
    feedbackIdempotencyKey: 'feedback-idem-1',
    reasonCode: 'recognition_incorrect',
    note: '我写的是目标字'
  }
  const feedback = await bff.submitStudentFeedback(feedbackInput, context)
  const duplicate = await bff.submitStudentFeedback(feedbackInput, context)
  assert.deepEqual(duplicate, feedback)
  assert.notEqual(feedback.reassessmentTaskId, original.taskId)
  assert.deepEqual(await bff.getAssessment({ taskId: original.taskId }, context), originalSnapshot)
  const reassessed = await bff.getAssessment({ taskId: feedback.reassessmentTaskId }, context)
  assert.equal(reassessed.status, 'partially_completed')
  assert.equal(reassessed.reassessmentOfTaskId, original.taskId)
  const records = await bff.getFeedbackRecords({}, context)
  assert.equal(records.entries.length, 1)
  assert.equal(records.entries[0].originalTaskId, original.taskId)
  assert.deepEqual(await bff.getFeedbackRecords({}, { subjectId: 'subject-2' }), { entries: [] })
})

test('share cards require a second guardian confirmation and expose only a revocable redacted payload', async () => {
  const { bff, repository } = setup()
  const task = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: task.taskId, cloudFileId: cloudFile(task), imageSha256: 'a'.repeat(64)
  }, context)
  const original = await bff.getAssessment({ taskId: task.taskId }, context)
  const shareInput = {
    taskId: task.taskId,
    shareIdempotencyKey: 'share-idem-1',
    shareConsentVersion: 'mvp-share-consent-draft-v1',
    guardianConfirmed: true
  }
  await assert.rejects(
    bff.createShareCard({ ...shareInput, guardianConfirmed: false }, context),
    /SHARE_GUARDIAN_CONFIRMATION_REQUIRED/
  )
  const share = await bff.createShareCard(shareInput, context)
  const duplicate = await bff.createShareCard(shareInput, context)
  assert.equal(duplicate.shareToken, share.shareToken)
  const publicCard = await bff.getSharedCard({ shareToken: share.shareToken })
  assert.equal(publicCard.payload.productName, '字有方')
  const serializedPayload = JSON.stringify(publicCard.payload)
  for (const forbidden of ['cloud://', 'practice/', 'task_', 'subject-', 'recognizedCharacter']) {
    assert.equal(serializedPayload.includes(forbidden), false, `share payload leaked ${forbidden}`)
  }
  const stored = await repository.getShareCard(share.shareCardId)
  assert.equal(JSON.stringify(stored).includes(share.shareToken), false)
  await assert.rejects(
    bff.revokeShareCard({ shareCardId: share.shareCardId }, { subjectId: 'subject-2' }),
    /SHARE_CARD_FORBIDDEN/
  )
  await bff.revokeShareCard({ shareCardId: share.shareCardId }, context)
  await assert.rejects(
    bff.getSharedCard({ shareToken: share.shareToken }),
    /SHARE_CARD_UNAVAILABLE/
  )
  assert.deepEqual(await bff.getAssessment({ taskId: task.taskId }, context), original)
  assert.equal(repository.auditEvents.filter((event) => event.eventType.startsWith('share_')).length, 2)
})

test('expired share cards are unavailable without changing the source result', async () => {
  const repository = new MemoryBffRepository()
  const gateway = new FixtureGateway()
  let current = Date.parse('2026-08-11T10:00:00.000Z')
  let id = 0
  const bff = createAssessmentBff({
    repository, gateway, consentVersion: 'consent-v1', enforceConsent: false,
    shareTokenSecret: 'share-test-secret', idFactory: () => String(++id),
    now: () => new Date(current).toISOString()
  })
  const task = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: task.taskId, cloudFileId: cloudFile(task), imageSha256: 'a'.repeat(64)
  }, context)
  await bff.getAssessment({ taskId: task.taskId }, context)
  const share = await bff.createShareCard({
    taskId: task.taskId, shareIdempotencyKey: 'expiring-share',
    shareConsentVersion: 'mvp-share-consent-draft-v1', guardianConfirmed: true
  }, context)
  current += 8 * 24 * 60 * 60 * 1000
  await assert.rejects(bff.getSharedCard({ shareToken: share.shareToken }), /SHARE_CARD_UNAVAILABLE/)
  assert.equal((await repository.getShareCard(share.shareCardId)).status, 'expired')
})

test('practice deletion is confirmed, idempotent, removes linked versions, and invalidates shares', async () => {
  const repository = new MemoryBffRepository()
  const gateway = new FixtureGateway()
  const deletedFiles = []
  let id = 0
  const bff = createAssessmentBff({
    repository, gateway, consentVersion: 'consent-v1', enforceConsent: false,
    shareTokenSecret: 'share-test-secret', idFactory: () => String(++id),
    now: () => '2026-08-11T10:00:00.000Z',
    fileDeleter: async (fileIds) => { deletedFiles.push(...fileIds); return { deleted: true } }
  })
  const task = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: task.taskId, cloudFileId: cloudFile(task), imageSha256: 'a'.repeat(64)
  }, context)
  await bff.getAssessment({ taskId: task.taskId }, context)
  const feedback = await bff.submitStudentFeedback({
    taskId: task.taskId, characterIndex: 1, feedbackIdempotencyKey: 'delete-feedback',
    reasonCode: 'recognition_incorrect', note: ''
  }, context)
  await bff.getAssessment({ taskId: feedback.reassessmentTaskId }, context)
  const share = await bff.createShareCard({
    taskId: task.taskId, shareIdempotencyKey: 'delete-share',
    shareConsentVersion: 'mvp-share-consent-draft-v1', guardianConfirmed: true
  }, context)
  const deletionInput = {
    taskId: task.taskId,
    requestId: 'delete-request-1',
    confirmationVersion: 'mvp-deletion-confirm-draft-v1',
    confirmed: true
  }
  await assert.rejects(
    bff.deletePractice({ ...deletionInput, confirmed: false }, context),
    /DELETION_CONFIRMATION_REQUIRED/
  )
  const job = await bff.deletePractice(deletionInput, context)
  const duplicate = await bff.deletePractice(deletionInput, context)
  assert.deepEqual(duplicate, job)
  assert.equal(job.status, 'completed')
  assert.equal(job.objectResults.find((item) => item.objectType === 'assessment_tasks').count, 2)
  assert.equal(job.objectResults.find((item) => item.objectType === 'character_results').count, 10)
  assert.equal(deletedFiles.length, 1)
  await assert.rejects(bff.getAssessment({ taskId: task.taskId }, context), /TASK_NOT_FOUND/)
  await assert.rejects(
    bff.getAssessment({ taskId: feedback.reassessmentTaskId }, context), /TASK_NOT_FOUND/
  )
  await assert.rejects(bff.getSharedCard({ shareToken: share.shareToken }), /SHARE_CARD_UNAVAILABLE/)
  assert.deepEqual(await bff.getWordbook({ filter: 'all' }, context), { entries: [] })
  assert.deepEqual(await bff.getDeletionJobs({}, { subjectId: 'subject-2' }), { entries: [] })
  assert.equal((await bff.getDeletionJobs({}, context)).entries.length, 1)
  assert.equal(repository.auditEvents.some((event) => event.eventType === 'practice_deleted'), true)
})

test('failed private file deletion leaves business records intact and records a failed job', async () => {
  const repository = new MemoryBffRepository()
  const gateway = new FixtureGateway()
  let id = 0
  const bff = createAssessmentBff({
    repository, gateway, consentVersion: 'consent-v1', enforceConsent: false,
    idFactory: () => String(++id), now: () => '2026-08-11T10:00:00.000Z',
    fileDeleter: async () => { throw new Error('PRIVATE_STORAGE_TEMPORARY_FAILURE') }
  })
  const task = await bff.createUploadTask(input, context)
  await bff.submitAssessment({
    taskId: task.taskId, cloudFileId: cloudFile(task), imageSha256: 'a'.repeat(64)
  }, context)
  await bff.getAssessment({ taskId: task.taskId }, context)
  const job = await bff.deletePractice({
    taskId: task.taskId, requestId: 'failed-delete',
    confirmationVersion: 'mvp-deletion-confirm-draft-v1', confirmed: true
  }, context)
  assert.equal(job.status, 'failed')
  assert.equal(job.errorCode, 'PRIVATE_STORAGE_TEMPORARY_FAILURE')
  assert.equal((await bff.getAssessment({ taskId: task.taskId }, context)).status, 'partially_completed')
})
