import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { AssessmentOrchestrator } from '../assessment-service/src/orchestrator.mjs'
import { createApprovedSyntheticPipeline } from '../assessment-service/src/pipeline/approved-synthetic-pipeline.mjs'
import { MemoryAssessmentRepository } from '../assessment-service/src/repository.mjs'
import { createAssessmentServer } from '../assessment-service/src/server.mjs'

const require = createRequire(import.meta.url)
const { createAssessmentBff } = require('../cloudfunctions/assessmentBff/core/bff-core')
const { MemoryBffRepository } = require('../cloudfunctions/assessmentBff/core/memory-repository')
const { RemoteAssessmentGateway } = require('../cloudfunctions/assessmentBff/core/remote-gateway')

test('create-upload-submit-assess-query vertical slice returns five character categories', async (t) => {
  const secret = 'integration-secret'
  const { provider, fixture } = await createApprovedSyntheticPipeline()
  const server = createAssessmentServer({
    secret,
    orchestrator: new AssessmentOrchestrator({
      repository: new MemoryAssessmentRepository(),
      provider
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const repository = new MemoryBffRepository()
  const gateway = new RemoteAssessmentGateway({
    baseUrl: `http://127.0.0.1:${address.port}`,
    secret,
    pollIntervalMs: 1,
    maximumPolls: 50
  })
  let idCall = 0
  const bff = createAssessmentBff({
    repository,
    gateway,
    idFactory: () => `vertical-slice-${++idCall}`,
    now: () => '2026-08-11T10:00:00.000Z',
    consentVersion: 'prototype-approved-v1'
  })
  const context = { subjectId: 'subject-integration' }

  await bff.recordConsent({
    consentVersion: 'prototype-approved-v1',
    privacyNoticeRead: true,
    guardianConfirmed: true
  }, context)

  const uploadTask = await bff.createUploadTask({
    localTaskId: 'local-integration',
    idempotencyKey: 'idem-integration',
    expectedText: fixture.targetText,
    consentVersion: 'prototype-approved-v1'
  }, context)
  assert.equal(uploadTask.status, 'uploading')
  assert.match(uploadTask.privateUploadPath, /^practice\/subject-integration\//)

  const accepted = await bff.submitAssessment({
    taskId: uploadTask.taskId,
    cloudFileId: `cloud://fixture/${uploadTask.privateUploadPath}.png`,
    imageSha256: fixture.imageSha256
  }, context)
  assert.equal(accepted.status, 'analyzing')

  const result = await bff.getAssessment({ taskId: uploadTask.taskId }, context)
  assert.equal(result.status, 'partially_completed')
  assert.equal(result.progressStage, 'finished')
  assert.deepEqual(result.summary, {
    total: 16, normal: 9, wrong: 1, needsCorrection: 4, uncertain: 1, failed: 1
  })
  assert.deepEqual(new Set(result.characters.map((item) => item.category)), new Set([
    'normal', 'wrong', 'needs_correction', 'uncertain', 'failed'
  ]))
  assert.equal(result.characters[0].scoreBreakdown.stability, null)
  assert.equal(result.characters[0].growthSummary.requiredPracticeCount, 2)

  const wordbook = await bff.getWordbook({ filter: 'all' }, context)
  assert.deepEqual(wordbook.entries.map((entry) => entry.targetCharacter), ['永', '山', '月', '心', '法'])
  const monthGrowth = await bff.getCharacterGrowth({ character: '月' }, context)
  assert.equal(monthGrowth.comparablePracticeCount, 1)
  assert.equal(monthGrowth.stabilityScore, null)

  const originalSnapshot = structuredClone(result)
  const feedback = await bff.submitStudentFeedback({
    taskId: result.taskId,
    characterIndex: 1,
    feedbackIdempotencyKey: 'feedback-integration-1',
    reasonCode: 'recognition_incorrect',
    note: '合成纵向测试'
  }, context)
  const reassessed = await bff.getAssessment({ taskId: feedback.reassessmentTaskId }, context)
  assert.equal(reassessed.status, 'partially_completed')
  assert.equal(reassessed.reassessmentOfTaskId, result.taskId)
  assert.deepEqual(await bff.getAssessment({ taskId: result.taskId }, context), originalSnapshot)

  const duplicate = await bff.createUploadTask({
    localTaskId: 'different-local-id',
    idempotencyKey: 'idem-integration',
    expectedText: '不应创建重复任务',
    consentVersion: 'prototype-approved-v1'
  }, context)
  assert.equal(duplicate.taskId, uploadTask.taskId)

  const share = await bff.createShareCard({
    taskId: result.taskId,
    shareIdempotencyKey: 'share-integration-1',
    shareConsentVersion: 'mvp-share-consent-draft-v1',
    guardianConfirmed: true
  }, context)
  const publicCard = await bff.getSharedCard({ shareToken: share.shareToken })
  assert.equal(JSON.stringify(publicCard.payload).includes('cloud://'), false)

  const deletion = await bff.deletePractice({
    taskId: result.taskId,
    requestId: 'deletion-integration-1',
    confirmationVersion: 'mvp-deletion-confirm-draft-v1',
    confirmed: true
  }, context)
  assert.equal(deletion.status, 'completed')
  await assert.rejects(bff.getAssessment({ taskId: result.taskId }, context), /TASK_NOT_FOUND/)
  await assert.rejects(
    bff.getAssessment({ taskId: feedback.reassessmentTaskId }, context), /TASK_NOT_FOUND/
  )
  await assert.rejects(bff.getSharedCard({ shareToken: share.shareToken }), /SHARE_CARD_UNAVAILABLE/)
  assert.deepEqual(await bff.getWordbook({ filter: 'all' }, context), { entries: [] })
})
