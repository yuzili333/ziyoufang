import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { SlidingWindowQuota } = require('../core/quota-guard')

test('sliding window quota is isolated by subject and reports retry delay', () => {
  const quota = new SlidingWindowQuota({ windowMs: 1_000, maximum: 2, policyVersion: 'quota-test-v1' })
  assert.equal(quota.consume('subject-1', 1_000).allowed, true)
  assert.equal(quota.consume('subject-1', 1_100).allowed, true)
  const blocked = quota.consume('subject-1', 1_200)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.retryAfterMs, 800)
  assert.equal(blocked.policyVersion, 'quota-test-v1')
  assert.equal(quota.consume('subject-2', 1_200).allowed, true)
  assert.equal(quota.consume('subject-1', 2_001).allowed, true)
})
