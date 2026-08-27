const assert = require('node:assert/strict')
const test = require('node:test')
const { processJob } = require('../src/worker')

test('worker refreshes media access, persists one result and completes its leased job', async () => {
  const calls = []
  const task = { taskId: 'task-1', subjectId: 'subject-1', status: 'analyzing', cloudFileId: 'oss://private/source.png' }
  const dependencies = {
    config: { heartbeatMs: 60_000 },
    queue: {
      heartbeat: async () => calls.push('heartbeat'),
      complete: async () => calls.push('complete'),
      fail: async () => { throw new Error('must not fail') },
      cancel: async () => calls.push('cancel')
    },
    repository: {
      getTask: async () => task,
      saveResult: async (_taskId, result) => calls.push(['save', result.status])
    },
    media: { createAccess: async () => ({ url: 'https://private.example/source.png', expiresAt: '2026-08-12T10:10:00.000Z' }) }
  }
  await processJob({
    job: { jobId: 'job-1', taskId: 'task-1', subjectId: 'subject-1', payload: { taskId: 'task-1' }, leaseOwner: 'worker-1' },
    dependencies,
    client: { run: async (input) => {
      assert.match(input.mediaAccess.url, /^https:/)
      return { status: 'completed', progressStage: 'finished', resultVersion: 1, summary: {}, characters: [] }
    } }
  })
  assert.deepEqual(calls, [['save', 'completed'], 'complete'])
})

test('worker leaves a failed task analyzing while the durable queue still has retries', async () => {
  const updates = []
  const dependencies = {
    config: { heartbeatMs: 60_000 },
    queue: { heartbeat: async () => {}, fail: async () => true, cancel: async () => {}, complete: async () => {} },
    repository: {
      getTask: async () => ({ taskId: 'task-1', status: 'analyzing', cloudFileId: 'oss://private/source.png' }),
      updateTask: async (...args) => updates.push(args)
    },
    media: { createAccess: async () => ({ url: 'https://private.example/source.png', expiresAt: '2026-08-12T10:10:00.000Z' }) }
  }
  await processJob({
    job: { jobId: 'job-1', taskId: 'task-1', subjectId: 'subject-1', payload: {}, leaseOwner: 'worker-1', attempts: 1, maxAttempts: 3 },
    dependencies,
    client: { run: async () => { throw new Error('OCR_TIMEOUT') } }
  })
  assert.deepEqual(updates, [])
})
