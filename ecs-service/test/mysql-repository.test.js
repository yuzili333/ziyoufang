const assert = require('node:assert/strict')
const test = require('node:test')
const { MySqlBffRepository } = require('../src/mysql-repository')

function fixture({ enqueueError = null } = {}) {
  const calls = []
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release')
  }
  let task = { _id: 'task-1', taskId: 'task-1', subjectId: 'subject-1', status: 'uploading' }
  const store = {
    async get(table, id, usedConnection, options) {
      assert.equal(usedConnection, connection)
      if (table !== 'assessment_tasks' || id !== 'task-1') return null
      if (options?.forUpdate) calls.push('lock-task')
      return structuredClone(task)
    },
    async put(table, document, usedConnection) {
      assert.equal(usedConnection, connection)
      calls.push(`put-${table}`)
      if (table === 'assessment_tasks') task = structuredClone(document)
      return document
    },
    async find() { return [] }
  }
  const pool = { getConnection: async () => connection }
  const repository = new MySqlBffRepository({ pool, store })
  const input = {
    taskId: 'task-1',
    taskPatch: { status: 'analyzing', submittedAt: '2026-08-26T10:00:00.000Z' },
    mediaObject: { mediaId: 'media-1', subjectId: 'subject-1' },
    assessmentTask: { taskId: 'task-1', subjectId: 'subject-1' },
    enqueue: async (_assessmentTask, usedConnection) => {
      assert.equal(usedConnection, connection)
      calls.push('enqueue')
      if (enqueueError) throw enqueueError
    }
  }
  return { calls, repository, input }
}

test('submission acceptance writes task, media and queue in one transaction', async () => {
  const { calls, repository, input } = fixture()
  const result = await repository.acceptSubmission(input)
  assert.equal(result.status, 'analyzing')
  assert.deepEqual(calls, [
    'begin', 'lock-task', 'put-assessment_tasks', 'put-media_objects', 'enqueue', 'commit', 'release'
  ])
})

test('submission acceptance rolls back all database writes when queue insertion fails', async () => {
  const { calls, repository, input } = fixture({ enqueueError: new Error('QUEUE_INSERT_FAILED') })
  await assert.rejects(repository.acceptSubmission(input), /QUEUE_INSERT_FAILED/)
  assert.deepEqual(calls, [
    'begin', 'lock-task', 'put-assessment_tasks', 'put-media_objects', 'enqueue', 'rollback', 'release'
  ])
})
