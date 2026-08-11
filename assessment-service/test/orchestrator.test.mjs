import assert from 'node:assert/strict'
import test from 'node:test'

import { AssessmentOrchestrator } from '../src/orchestrator.mjs'
import { FixtureAssessmentProvider } from '../src/providers/fixture-provider.mjs'
import { MemoryAssessmentRepository } from '../src/repository.mjs'
import { SafeTelemetry } from '../src/telemetry.mjs'

const input = {
  taskId: 'task-1',
  localTaskId: 'local-1',
  idempotencyKey: 'idem-1',
  subjectId: 'subject-1',
  imageSha256: 'a'.repeat(64),
  expectedText: '永山月'
}

test('fixture orchestrator produces versioned partial multi-character result', async () => {
  const repository = new MemoryAssessmentRepository()
  const orchestrator = new AssessmentOrchestrator({
    repository,
    provider: new FixtureAssessmentProvider({ enabled: true }),
    now: () => '2026-08-11T10:00:00.000Z'
  })
  const accepted = await orchestrator.accept(input)
  assert.equal(accepted.status, 'analyzing')
  const result = await orchestrator.process(input.taskId)
  assert.equal(result.status, 'partially_completed')
  assert.equal(result.progressStage, 'finished')
  assert.deepEqual(result.summary, {
    total: 5, normal: 1, wrong: 1, needsCorrection: 1, uncertain: 1, failed: 1
  })
  assert.deepEqual(result.characters.map((item) => item.category), [
    'normal', 'wrong', 'needs_correction', 'uncertain', 'failed'
  ])
})

test('accept is idempotent for the same task id', async () => {
  const repository = new MemoryAssessmentRepository()
  const orchestrator = new AssessmentOrchestrator({
    repository,
    provider: new FixtureAssessmentProvider({ enabled: true })
  })
  const first = await orchestrator.accept(input)
  const second = await orchestrator.accept({ ...input, expectedText: '被忽略的重复输入' })
  assert.deepEqual(second, first)
})

test('short-lived media access is delivered to the provider but never persisted with the task', async () => {
  const repository = new MemoryAssessmentRepository()
  let receivedAccess
  const provider = {
    name: 'media-access-test',
    async assess(task) {
      receivedAccess = task.mediaAccess
      return {
        result: {
          status: 'completed', progressStage: 'finished', characters: [],
          summary: { total: 0, normal: 0, wrong: 0, needsCorrection: 0, uncertain: 0, failed: 0 }
        }
      }
    }
  }
  const orchestrator = new AssessmentOrchestrator({
    repository,
    provider,
    now: () => '2026-08-11T10:00:00.000Z'
  })
  const mediaAccess = {
    url: 'https://private-media.example/source.jpg?temporary=secret',
    expiresAt: '2026-08-11T10:10:00.000Z'
  }
  await orchestrator.accept({
    ...input,
    mediaAccess,
    cloudFileId: 'cloud://private/practice/source.jpg',
    privateUploadPath: 'practice/private/source',
    consentVersion: 'must-not-cross-service-boundary'
  })
  const persisted = await repository.get(input.taskId)
  assert.equal(persisted.mediaAccess, undefined)
  assert.equal(persisted.cloudFileId, undefined)
  assert.equal(persisted.privateUploadPath, undefined)
  assert.equal(persisted.consentVersion, undefined)
  assert.equal(JSON.stringify(persisted).includes('private-media.example'), false)
  await orchestrator.process(input.taskId)
  assert.deepEqual(receivedAccess, mediaAccess)
  assert.equal((await repository.get(input.taskId)).mediaAccess, undefined)
})

test('orchestrator rejects insecure, expired or excessively long media grants', async () => {
  const orchestrator = new AssessmentOrchestrator({
    repository: new MemoryAssessmentRepository(),
    provider: new FixtureAssessmentProvider({ enabled: true }),
    now: () => '2026-08-11T10:00:00.000Z'
  })
  for (const mediaAccess of [
    { url: 'http://private-media.example/source.jpg', expiresAt: '2026-08-11T10:10:00.000Z' },
    { url: 'https://private-media.example/source.jpg', expiresAt: '2026-08-11T09:59:00.000Z' },
    { url: 'https://private-media.example/source.jpg', expiresAt: '2026-08-11T11:00:00.000Z' }
  ]) {
    await assert.rejects(orchestrator.accept({ ...input, mediaAccess }), /MEDIA_ACCESS_INVALID/)
  }
})

test('orchestrator records fixture usage without exposing the task id', async () => {
  const repository = new MemoryAssessmentRepository()
  const telemetry = new SafeTelemetry({ taskHashSecret: 'test-secret' })
  let time = 1_000
  const orchestrator = new AssessmentOrchestrator({
    repository,
    provider: new FixtureAssessmentProvider({ enabled: true }),
    telemetry,
    clock: () => (time += 25)
  })
  await orchestrator.accept(input)
  await orchestrator.process(input.taskId)
  const snapshot = telemetry.snapshot()
  assert.equal(snapshot.countsByType.assessment_accepted, 1)
  assert.equal(snapshot.countsByType.assessment_completed, 1)
  assert.equal(snapshot.cost.providerCalls, 1)
  assert.equal(snapshot.cost.byProviderMicros.fixture, 0)
  assert.equal(snapshot.cost.cacheHitRate, 1)
  assert.equal(JSON.stringify(telemetry.readEventsForTesting()).includes(input.taskId), false)
})

test('provider failure is persisted as retryable and counted with a safe code', async () => {
  const repository = new MemoryAssessmentRepository()
  const telemetry = new SafeTelemetry()
  const provider = {
    name: 'failing-provider',
    async assess() {
      const error = new Error('provider details must not be recorded')
      error.code = 'OCR_TIMEOUT'
      throw error
    }
  }
  const orchestrator = new AssessmentOrchestrator({ repository, provider, telemetry })
  await orchestrator.accept(input)
  const result = await orchestrator.process(input.taskId)
  assert.equal(result.status, 'failed')
  assert.equal(result.retryable, true)
  assert.equal(result.errorCode, 'OCR_TIMEOUT')
  assert.equal(telemetry.snapshot().errorCounts.OCR_TIMEOUT, 2)
  assert.equal(JSON.stringify(telemetry.readEventsForTesting()).includes('provider details'), false)
})

test('cancellation before result persistence cannot be overwritten by a late provider result', async () => {
  const repository = new MemoryAssessmentRepository()
  const telemetry = new SafeTelemetry()
  let releaseProvider
  let providerReachedCheckpoint
  const checkpoint = new Promise((resolve) => { providerReachedCheckpoint = resolve })
  const gate = new Promise((resolve) => { releaseProvider = resolve })
  const provider = {
    name: 'delayed-provider',
    async assess(_task, { onProgress }) {
      await onProgress('quality_checking')
      providerReachedCheckpoint()
      await gate
      await onProgress('segmenting')
      return {
        result: {
          status: 'completed', progressStage: 'finished', characters: [],
          summary: { total: 0, normal: 0, wrong: 0, needsCorrection: 0, uncertain: 0, failed: 0 }
        }
      }
    }
  }
  const orchestrator = new AssessmentOrchestrator({ repository, provider, telemetry })
  await orchestrator.accept(input)
  const processing = orchestrator.process(input.taskId)
  await checkpoint
  const cancelled = await orchestrator.cancel(input.taskId)
  assert.equal(cancelled.status, 'cancelled')
  releaseProvider()
  const final = await processing
  assert.equal(final.status, 'cancelled')
  assert.equal((await repository.get(input.taskId)).status, 'cancelled')
  assert.equal(telemetry.snapshot().countsByType.assessment_completed ?? 0, 0)
})
