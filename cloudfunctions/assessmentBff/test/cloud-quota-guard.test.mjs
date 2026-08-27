import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { CloudSlidingWindowQuota } = require('../core/cloud-quota-guard')

const createTransactionalDatabase = () => {
  const records = new Map()
  const collection = () => ({
    doc(id) {
      return {
        async get() {
          const data = records.get(id)
          if (!data) {
            const error = new Error('NOT_FOUND')
            error.errCode = 'DATABASE_DOCUMENT_NOT_EXISTED'
            throw error
          }
          return { data: structuredClone(data) }
        },
        async set({ data }) { records.set(id, structuredClone(data)) }
      }
    },
    where(query) {
      const values = [...records.values()].filter((record) => (
        record.subjectId === query.subjectId
        && record.policyVersion === query.policyVersion
        && record.occurredAt >= query.occurredAt.$gte
      ))
      return {
        orderBy() {
          values.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
          return this
        },
        limit(value) {
          return { get: async () => ({ data: values.slice(0, value).map((item) => structuredClone(item)) }) }
        }
      }
    }
  })
  return {
    command: { gte: (value) => ({ $gte: value }) },
    async runTransaction(callback) { return callback({ collection }) },
    records
  }
}

test('distributed quota is tenant-isolated, transactional, window-bound, and idempotent', async () => {
  const db = createTransactionalDatabase()
  const quota = new CloudSlidingWindowQuota({
    db, windowMs: 1_000, maximum: 2, policyVersion: 'quota-cloud-v1', idFactory: () => 'unused'
  })

  assert.equal((await quota.consume('subject-1', 1_000, 'idem-1')).allowed, true)
  assert.equal((await quota.consume('subject-1', 1_100, 'idem-2')).allowed, true)
  const blocked = await quota.consume('subject-1', 1_200, 'idem-3')
  assert.deepEqual(blocked, {
    allowed: false, retryAfterMs: 800, remaining: 0, policyVersion: 'quota-cloud-v1'
  })
  assert.equal((await quota.consume('subject-2', 1_200, 'idem-1')).allowed, true)
  const duplicate = await quota.consume('subject-1', 1_250, 'idem-1')
  assert.equal(duplicate.allowed, true)
  assert.equal(duplicate.duplicate, true)
  assert.equal(db.records.size, 3)
  assert.equal((await quota.consume('subject-1', 2_001, 'idem-4')).allowed, true)
})
