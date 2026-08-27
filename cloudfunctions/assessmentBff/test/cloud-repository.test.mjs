import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createCloudRepository } = require('../core/cloud-repository')

test('cloud repository writes source media metadata to the private media collection', async () => {
  const writes = []
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async set({ data }) { writes.push({ name, id, data }) }
          }
        }
      }
    }
  }
  const repository = createCloudRepository(db)
  const media = {
    mediaId: 'media_task-1_source', subjectId: 'subject-1', sourceTaskId: 'task-1',
    kind: 'source_photo', privateObjectRef: 'cloud://private/photo.jpg', sha256: 'a'.repeat(64),
    createdAt: '2026-08-12T10:00:00.000Z', expiresAt: '2026-09-11T10:00:00.000Z', lifecycleStatus: 'active'
  }

  assert.deepEqual(await repository.upsertMediaObject(media), media)
  assert.deepEqual(writes, [{
    name: 'media_objects', id: media.mediaId, data: { ...media, _id: media.mediaId }
  }])
})

test('cloud repository reads media metadata and treats missing documents as absent', async () => {
  const media = { _id: 'media-1', mediaId: 'media-1', lifecycleStatus: 'active' }
  const db = {
    collection() {
      return {
        doc(id) {
          return {
            async get() {
              if (id === media.mediaId) return { data: media }
              const error = new Error('DATABASE_DOCUMENT_NOT_EXISTED')
              error.errCode = 'DATABASE_DOCUMENT_NOT_EXISTED'
              throw error
            }
          }
        }
      }
    }
  }
  const repository = createCloudRepository(db)

  assert.deepEqual(await repository.getMediaObject('media-1'), media)
  assert.equal(await repository.getMediaObject('missing'), null)
})

test('cloud repository creates an HMAC-derived subject account once and preserves creation time', async () => {
  const writes = []
  let account = null
  const db = {
    collection(name) {
      return {
        doc(id) {
          return {
            async get() {
              if (!account) {
                const error = new Error('NOT_FOUND')
                error.errCode = 'DATABASE_DOCUMENT_NOT_EXISTED'
                throw error
              }
              return { data: account }
            },
            async set({ data }) { account = data; writes.push({ name, id, data }) }
          }
        }
      }
    }
  }
  const repository = createCloudRepository(db)
  await repository.upsertSubjectAccount({
    subjectId: 'sub_1', wechatSubjectKey: 'wsk_1', status: 'active',
    createdAt: '2026-08-12T10:00:00.000Z', updatedAt: '2026-08-12T10:00:00.000Z'
  })
  const second = await repository.upsertSubjectAccount({
    subjectId: 'sub_1', wechatSubjectKey: 'wsk_1', status: 'active',
    createdAt: '2026-08-13T10:00:00.000Z', updatedAt: '2026-08-13T10:00:00.000Z'
  })

  assert.equal(second.createdAt, '2026-08-12T10:00:00.000Z')
  assert.equal(second.updatedAt, '2026-08-13T10:00:00.000Z')
  assert.equal(writes[1].data.wechatSubjectKey, 'wsk_1')
})

test('cloud repository creates an idempotent task inside one database transaction', async () => {
  const tasks = new Map()
  let transactionCalls = 0
  const taskCollection = {
    where({ subjectId, idempotencyKey }) {
      const matches = [...tasks.values()].filter((task) => (
        task.subjectId === subjectId && task.idempotencyKey === idempotencyKey
      ))
      return { limit: () => ({ get: async () => ({ data: matches }) }) }
    },
    doc(id) {
      return { async set({ data }) { tasks.set(id, data) } }
    }
  }
  const db = {
    collection(name) {
      if (name === 'assessment_tasks') return taskCollection
      return { doc: () => ({}) }
    },
    async runTransaction(callback) {
      transactionCalls += 1
      return callback({ collection: (name) => name === 'assessment_tasks' ? taskCollection : null })
    }
  }
  const repository = createCloudRepository(db)
  const first = await repository.createTask({
    taskId: 'task-1', subjectId: 'subject-1', idempotencyKey: 'idem-1'
  })
  const duplicate = await repository.createTask({
    taskId: 'task-2', subjectId: 'subject-1', idempotencyKey: 'idem-1'
  })

  assert.equal(transactionCalls, 2)
  assert.equal(tasks.size, 1)
  assert.equal(first.taskId, 'task-1')
  assert.equal(duplicate.taskId, 'task-1')
})
