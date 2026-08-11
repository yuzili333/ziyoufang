import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { RemoteAssessmentGateway } = require('../core/remote-gateway')

test('remote start submits once with idempotency and signature headers instead of long polling', async () => {
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, options })
    return {
      ok: true,
      status: 202,
      async json() { return { taskId: 'task-1', status: 'analyzing', progressStage: 'quality_checking' } }
    }
  }
  const gateway = new RemoteAssessmentGateway({
    baseUrl: 'https://assessment.example', secret: 'test-secret', fetchImpl
  })
  const accepted = await gateway.start({ taskId: 'task-1', idempotencyKey: 'idem-1' })
  assert.equal(accepted.status, 'analyzing')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].options.headers['idempotency-key'], 'idem-1')
  assert.equal(requests[0].options.headers['x-task-id'], 'task-1')
  assert.match(requests[0].options.headers['x-signature'], /^[a-f0-9]{64}$/)
})

test('remote status is fetched by a separate signed request', async () => {
  const requests = []
  const gateway = new RemoteAssessmentGateway({
    baseUrl: 'https://assessment.example',
    secret: 'test-secret',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        async json() { return { taskId: 'task-1', status: 'partially_completed' } }
      }
    }
  })
  const result = await gateway.get('task-1')
  assert.equal(result.status, 'partially_completed')
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /\/v1\/assessments\/task-1$/)
  assert.match(requests[0].options.headers['x-signature'], /^[a-f0-9]{64}$/)
})
