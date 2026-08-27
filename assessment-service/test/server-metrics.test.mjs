import assert from 'node:assert/strict'
import test from 'node:test'

import { signRequest } from '../src/security.mjs'
import { assertProductionSecrets, createAssessmentServer } from '../src/server.mjs'
import { SafeTelemetry } from '../src/telemetry.mjs'

const secret = 'metrics-hmac-secret'

test('assessment production secrets must be long and purpose-distinct', () => {
  assert.doesNotThrow(() => assertProductionSecrets({
    BFF_HMAC_SECRET: 'b'.repeat(32), TELEMETRY_HASH_SECRET: 't'.repeat(32)
  }))
  assert.throws(() => assertProductionSecrets({ BFF_HMAC_SECRET: 'short' }), /MINIMUM_32_BYTES_REQUIRED/)
  assert.throws(() => assertProductionSecrets({
    BFF_HMAC_SECRET: 'x'.repeat(32), TELEMETRY_HASH_SECRET: 'x'.repeat(32)
  }), /PRODUCTION_SECRETS_MUST_BE_DISTINCT/)
})

const signedHeaders = ({ path, nonce }) => {
  const timestamp = new Date().toISOString()
  const request = { method: 'GET', path, timestamp, nonce, body: '' }
  return {
    'x-request-timestamp': timestamp,
    'x-request-nonce': nonce,
    'x-signature': signRequest(request, secret)
  }
}

test('metrics endpoint requires a valid signature and rejects nonce replay', async (context) => {
  const telemetry = new SafeTelemetry({ taskHashSecret: 'metrics-test-secret' })
  telemetry.emit('provider_call', {
    taskId: 'task-never-returned',
    provider: 'ocr',
    operation: 'recognize',
    latencyMs: 125,
    costMicros: 600,
    cacheHit: false,
    status: 'success'
  })
  const server = createAssessmentServer({ secret, telemetry })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => server.close())
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}/internal/metrics`

  const unsigned = await fetch(url)
  assert.equal(unsigned.status, 401)

  const headers = signedHeaders({ path: '/internal/metrics', nonce: 'metrics-nonce-1' })
  const signed = await fetch(url, { headers })
  assert.equal(signed.status, 200)
  const snapshot = await signed.json()
  assert.equal(snapshot.latencyMs.p95, 125)
  assert.equal(snapshot.cost.byProviderMicros.ocr, 600)
  assert.equal(JSON.stringify(snapshot).includes('task-never-returned'), false)

  const replayed = await fetch(url, { headers })
  assert.equal(replayed.status, 409)
  assert.deepEqual(await replayed.json(), { error: 'REPLAYED_NONCE' })
})

test('health endpoint is unsigned and assessment can be disabled for a font-only deployment smoke test', async (context) => {
  const server = createAssessmentServer({ secret, assessmentEnabled: false })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => server.close())
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`

  const health = await fetch(`${baseUrl}/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok' })
  assert.equal(health.headers.has('x-powered-by'), false)

  const body = JSON.stringify({ taskId: 'must-not-be-accepted' })
  const timestamp = new Date().toISOString()
  const path = '/v1/assessments'
  const headers = {
    'content-type': 'application/json',
    'x-request-timestamp': timestamp,
    'x-request-nonce': 'font-smoke-assessment-disabled',
    'x-signature': signRequest({ method: 'POST', path, timestamp, nonce: 'font-smoke-assessment-disabled', body }, secret)
  }
  const blocked = await fetch(`${baseUrl}${path}`, { method: 'POST', headers, body })
  assert.equal(blocked.status, 503)
  assert.deepEqual(await blocked.json(), { error: 'ASSESSMENT_PROVIDER_NOT_ENABLED' })
})
