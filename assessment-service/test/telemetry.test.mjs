import assert from 'node:assert/strict'
import test from 'node:test'

import { SafeTelemetry, safeErrorCode } from '../src/telemetry.mjs'

test('telemetry hashes task identifiers and never stores the raw value', () => {
  const telemetry = new SafeTelemetry({
    taskHashSecret: 'telemetry-test-secret',
    now: () => '2026-08-11T12:00:00.000Z'
  })
  const event = telemetry.emit('assessment_accepted', {
    taskId: 'sensitive-task-id',
    status: 'analyzing',
    stage: 'quality_checking'
  })
  assert.match(event.taskHash, /^[a-f0-9]{64}$/)
  assert.equal('taskId' in event, false)
  assert.equal(JSON.stringify(telemetry.readEventsForTesting()).includes('sensitive-task-id'), false)
})

test('telemetry rejects sensitive and unknown fields', () => {
  const telemetry = new SafeTelemetry()
  assert.throws(
    () => telemetry.emit('provider_call', { imagePath: '/private/photo.jpg' }),
    /TELEMETRY_SENSITIVE_FIELD_REJECTED/
  )
  assert.throws(
    () => telemetry.emit('provider_call', { arbitraryMetadata: 'value' }),
    /TELEMETRY_FIELD_NOT_ALLOWED/
  )
})

test('snapshot reports latency percentiles, provider costs and cache hit rate', () => {
  const telemetry = new SafeTelemetry()
  for (const [index, latencyMs] of [10, 20, 30, 40, 100].entries()) {
    telemetry.emit('provider_call', {
      taskId: `task-${index}`,
      provider: index < 3 ? 'ocr' : 'vision',
      operation: 'recognize',
      latencyMs,
      costMicros: (index + 1) * 100,
      cacheHit: index === 0,
      status: 'success'
    })
  }
  const snapshot = telemetry.snapshot()
  assert.deepEqual(snapshot.latencyMs, { samples: 5, p50: 30, p95: 100 })
  assert.deepEqual(snapshot.cost, {
    providerCalls: 5,
    failedProviderCalls: 0,
    errorRate: 0,
    totalMicros: 1500,
    averagePerProviderCallMicros: 300,
    byProviderMicros: { ocr: 600, vision: 900 },
    cacheHitRate: 0.2
  })
})

test('provider error rate excludes non-provider lifecycle events', () => {
  const telemetry = new SafeTelemetry()
  telemetry.emit('provider_call', {
    taskId: 'task-1', provider: 'ocr', operation: 'recognize', latencyMs: 10,
    costMicros: 0, cacheHit: false, status: 'success'
  })
  telemetry.emit('provider_call', {
    taskId: 'task-2', provider: 'ocr', operation: 'recognize', latencyMs: 30,
    costMicros: 0, cacheHit: false, status: 'failed', errorCode: 'OCR_TIMEOUT'
  })
  telemetry.emit('assessment_failed', {
    taskId: 'task-2', latencyMs: 30, status: 'failed', errorCode: 'OCR_TIMEOUT'
  })
  const snapshot = telemetry.snapshot()
  assert.deepEqual(snapshot.latencyMs, { samples: 2, p50: 10, p95: 30 })
  assert.equal(snapshot.cost.errorRate, 0.5)
  assert.equal(snapshot.cost.failedProviderCalls, 1)
})

test('unsafe provider errors collapse to a bounded error code', () => {
  assert.equal(safeErrorCode({ code: 'OCR_TIMEOUT' }), 'OCR_TIMEOUT')
  assert.equal(safeErrorCode(new Error('request failed for /private/photo.jpg')), 'INTERNAL_ERROR')
})
