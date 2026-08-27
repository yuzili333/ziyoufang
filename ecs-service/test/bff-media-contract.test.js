const assert = require('node:assert/strict')
const test = require('node:test')
const { createAssessmentBff } = require('../../cloudfunctions/assessmentBff/core/bff-core')
const { MemoryBffRepository } = require('../../cloudfunctions/assessmentBff/core/memory-repository')

test('ECS BFF accepts opaque mediaId and ETag while keeping the OSS object reference private', async () => {
  const repository = new MemoryBffRepository()
  const queued = []
  const bff = createAssessmentBff({
    repository,
    gateway: {
      async start(task) { queued.push(task); return { status: 'analyzing' } },
      get: (taskId) => repository.getTask(taskId),
      cancel: async (taskId) => ({ taskId, status: 'cancelled', progressStage: 'finished' })
    },
    enforceConsent: false,
    fileVerifier: async ({ mediaId, etag, task }) => mediaId === `media_${task.taskId}_source` && etag === 'etag-1'
      ? { mediaId, privateObjectRef: `oss://private/${task.privateUploadPath}.png` }
      : false
  })
  const context = { subjectId: 'subject-1' }
  const upload = await bff.createUploadTask({
    localTaskId: 'local-1', idempotencyKey: 'idem-1', expectedText: '永', consentVersion: 'mvp-consent-draft-v1'
  }, context)
  const submitted = await bff.submitAssessment({
    taskId: upload.taskId, mediaId: `media_${upload.taskId}_source`, imageSha256: 'a'.repeat(64), etag: 'etag-1'
  }, context)
  assert.equal(submitted.status, 'analyzing')
  assert.equal(JSON.stringify(submitted).includes('oss://'), false)
  assert.equal(JSON.stringify(queued).includes('oss://private/'), false, 'worker receives only a short-lived media grant')
  const persisted = await repository.getTask(upload.taskId)
  assert.match(persisted.cloudFileId, /^oss:\/\/private\//)
})

test('ECS submission acceptor replaces non-atomic task, media and queue writes', async () => {
  const repository = new MemoryBffRepository()
  const accepted = []
  const bff = createAssessmentBff({
    repository,
    gateway: {
      async start() { throw new Error('gateway start must not run after atomic acceptance') },
      get: (taskId) => repository.getTask(taskId),
      cancel: async (taskId) => ({ taskId, status: 'cancelled' })
    },
    enforceConsent: false,
    fileVerifier: async ({ mediaId, task }) => ({
      mediaId, privateObjectRef: `oss://private/${task.privateUploadPath}.jpg`
    }),
    submissionAcceptor: async (submission) => {
      accepted.push(submission)
      const analyzing = await repository.updateTask(submission.taskId, submission.taskPatch)
      await repository.upsertMediaObject(submission.mediaObject)
      return analyzing
    }
  })
  const context = { subjectId: 'subject-1' }
  const upload = await bff.createUploadTask({
    localTaskId: 'local-atomic', idempotencyKey: 'idem-atomic', expectedText: '永',
    consentVersion: 'mvp-consent-draft-v1'
  }, context)
  const mediaId = `media_${upload.taskId}_source`
  const submitted = await bff.submitAssessment({
    taskId: upload.taskId, mediaId, imageSha256: 'b'.repeat(64), etag: 'etag-atomic'
  }, context)
  assert.equal(submitted.status, 'analyzing')
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].assessmentTask.taskId, upload.taskId)
  assert.equal(accepted[0].assessmentTask.imageSha256, 'b'.repeat(64))
  assert.equal(JSON.stringify(accepted[0].assessmentTask).includes('oss://'), false)
})
