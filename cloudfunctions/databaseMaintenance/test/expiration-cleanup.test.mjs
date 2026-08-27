import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createExpirationCleanup, storageDeletionSucceeded } = require('../core/expiration-cleanup')

const createDatabase = (seed) => {
  const collections = new Map(Object.entries(seed).map(([name, rows]) => [name, new Map(rows.map((row) => [row._id, { ...row }]))]))
  const ensure = (name) => {
    if (!collections.has(name)) collections.set(name, new Map())
    return collections.get(name)
  }
  return {
    collections,
    command: { lte: (value) => ({ $lte: value }) },
    collection(name) {
      const values = ensure(name)
      return {
        where(condition) {
          const cutoff = condition.expiresAt.$lte
          const query = {
            orderBy() { return query },
            limit(limit) {
              return { async get() {
                return { data: [...values.values()]
                  .filter((row) => row.expiresAt <= cutoff)
                  .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt))
                  .slice(0, limit) }
              } }
            }
          }
          return query
        },
        doc(id) {
          return {
            async set({ data }) { values.set(id, { ...data }) },
            async update({ data }) { values.set(id, { ...values.get(id), ...data }) },
            async remove() { values.delete(id) }
          }
        }
      }
    }
  }
}

test('expiration cleanup removes quota, audits shares, and deletes private media before metadata', async () => {
  const db = createDatabase({
    quota_events: [{ _id: 'quota-1', expiresAt: '2026-08-12T09:00:00.000Z' }],
    share_cards: [{ _id: 'share-1', subjectId: 'subject-1', expiresAt: '2026-08-12T09:00:00.000Z' }],
    media_objects: [{
      _id: 'media-1', subjectId: 'subject-1', privateObjectRef: 'cloud://private/source.jpg',
      lifecycleStatus: 'active', expiresAt: '2026-08-12T09:00:00.000Z'
    }]
  })
  const deletedFiles = []
  const cleanup = createExpirationCleanup({
    db,
    deleteCloudFiles: async (fileList) => {
      deletedFiles.push(...fileList)
      return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) }
    },
    now: () => new Date('2026-08-12T10:00:00.000Z')
  })

  const summary = await cleanup.run()

  assert.equal(summary.scanned, 3)
  assert.deepEqual(summary.deleted, { quota_events: 1, share_cards: 1, media_objects: 1 })
  assert.deepEqual(summary.failures, [])
  assert.deepEqual(deletedFiles, ['cloud://private/source.jpg'])
  assert.equal(db.collections.get('quota_events').size, 0)
  assert.equal(db.collections.get('share_cards').size, 0)
  assert.equal(db.collections.get('media_objects').size, 0)
  assert.equal(db.collections.get('audit_events').size, 1)
  const audit = [...db.collections.get('audit_events').values()][0]
  assert.equal(audit.eventType, 'share_expired')
  assert.equal(audit.subjectId, 'subject-1')
  assert.equal(audit.resourceIdHash.length, 64)
})

test('expiration cleanup enforces one global batch limit and shares capacity across collections', async () => {
  const db = createDatabase({
    quota_events: [
      { _id: 'quota-1', expiresAt: '2026-08-12T08:00:00.000Z' },
      { _id: 'quota-2', expiresAt: '2026-08-12T09:00:00.000Z' }
    ],
    share_cards: [{ _id: 'share-1', subjectId: 'subject-1', expiresAt: '2026-08-12T09:00:00.000Z' }]
  })
  const cleanup = createExpirationCleanup({
    db,
    deleteCloudFiles: async () => ({ fileList: [] }),
    now: () => new Date('2026-08-12T10:00:00.000Z'),
    batchLimit: 2
  })

  const summary = await cleanup.run()

  assert.equal(summary.scanned, 2)
  assert.equal(db.collections.get('quota_events').size, 1)
  assert.equal(db.collections.get('share_cards').size, 0)
})

test('failed media deletion keeps metadata and reports only a sanitized code', async () => {
  const db = createDatabase({
    media_objects: [{
      _id: 'media-secret-id', privateObjectRef: 'cloud://private/secret.jpg', lifecycleStatus: 'active',
      expiresAt: '2026-08-12T09:00:00.000Z'
    }]
  })
  const cleanup = createExpirationCleanup({
    db,
    deleteCloudFiles: async () => ({ fileList: [{ status: -1, errMsg: 'permission denied /private/secret.jpg' }] }),
    now: () => new Date('2026-08-12T10:00:00.000Z')
  })

  const summary = await cleanup.run()

  assert.equal(db.collections.get('media_objects').size, 1)
  assert.deepEqual(summary.failures, [{ collection: 'media_objects', code: 'PRIVATE_MEDIA_DELETE_FAILED' }])
  assert.equal(JSON.stringify(summary).includes('secret.jpg'), false)
})

test('storage deletion accepts provider success and already-missing responses', () => {
  assert.equal(storageDeletionSucceeded({ fileList: [{ status: 0 }] }), true)
  assert.equal(storageDeletionSucceeded({ fileList: [{ status: -1, errMsg: 'file not exist' }] }), true)
  assert.equal(storageDeletionSucceeded({ fileList: [{ status: -1, errMsg: 'permission denied' }] }), false)
})
