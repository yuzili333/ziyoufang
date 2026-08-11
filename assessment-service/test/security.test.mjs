import assert from 'node:assert/strict'
import test from 'node:test'

import { NonceReplayGuard, signRequest, verifyRequest } from '../src/security.mjs'

test('service signatures bind method, path, timestamp, nonce and body', () => {
  const input = {
    method: 'POST',
    path: '/v1/assessments',
    timestamp: '2026-08-11T10:00:00.000Z',
    nonce: 'nonce-1',
    body: '{"taskId":"task-1"}'
  }
  const secret = 'test-secret'
  const signature = signRequest(input, secret)
  assert.equal(verifyRequest(input, signature, secret, Date.parse(input.timestamp)), true)
  assert.equal(verifyRequest({ ...input, body: '{}' }, signature, secret, Date.parse(input.timestamp)), false)
})

test('expired signatures are rejected', () => {
  const input = {
    method: 'GET', path: '/v1/assessments/task-1',
    timestamp: '2026-08-11T10:00:00.000Z', nonce: 'nonce-2', body: ''
  }
  const signature = signRequest(input, 'secret')
  assert.equal(verifyRequest(input, signature, 'secret', Date.parse(input.timestamp) + 6 * 60_000), false)
})

test('nonce replay guard accepts once and expires old entries', () => {
  let current = 1_000
  const guard = new NonceReplayGuard({ ttlMs: 300, now: () => current })
  assert.equal(guard.consume('nonce-1'), true)
  assert.equal(guard.consume('nonce-1'), false)
  current += 301
  assert.equal(guard.consume('nonce-1'), true)
  assert.equal(guard.consume(''), false)
})
