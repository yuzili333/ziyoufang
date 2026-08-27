const assert = require('node:assert/strict')
const test = require('node:test')
const { OssMediaService } = require('../src/oss-media')

const config = {
  region: 'cn-hangzhou', endpoint: 'https://oss-cn-hangzhou-internal.aliyuncs.com',
  publicUploadHost: 'https://bucket.oss-cn-hangzhou.aliyuncs.com',
  publicAccessHost: 'https://bucket.oss-cn-hangzhou.aliyuncs.com',
  bucket: 'bucket'
}
const credentials = { get: async () => ({
  accessKeyId: 'temporary-id', accessKeySecret: 'temporary-secret', securityToken: 'temporary-token'
}) }

test('OSS upload ticket is scoped to one task object and expires within fifteen minutes', async () => {
  const now = Date.parse('2026-08-12T10:00:00.000Z')
  const media = new OssMediaService({ config, credentials, now: () => now })
  const ticket = await media.createUploadTicket({
    subjectId: 'subject-1', extension: 'png',
    task: {
      taskId: 'task-1', subjectId: 'subject-1', status: 'uploading', privateUploadPath: 'practice/subject-1/task-1/source',
      uploadPolicy: { maxBytes: 15 * 1024 * 1024, expiresAt: '2026-08-12T10:15:00.000Z' }
    }
  })
  assert.equal(ticket.mediaId, 'media_task-1_source')
  const policy = JSON.parse(Buffer.from(ticket.formFields.policy, 'base64').toString('utf8'))
  assert.deepEqual(policy.conditions[0], { bucket: 'bucket' })
  assert.deepEqual(policy.conditions[1], ['eq', '$key', 'practice/subject-1/task-1/source.png'])
  assert.deepEqual(policy.conditions[2], ['content-length-range', 1, 15 * 1024 * 1024])
  assert.equal(ticket.formFields['Content-Type'], 'image/png')
  assert.equal(ticket.formFields['x-oss-signature-version'], 'OSS4-HMAC-SHA256')
  assert.match(ticket.formFields['x-oss-credential'], /^temporary-id\/20260812\/cn-hangzhou\/oss\/aliyun_v4_request$/)
  assert.match(ticket.formFields['x-oss-signature'], /^[a-f0-9]{64}$/)
  assert.equal(ticket.formFields.OSSAccessKeyId, undefined)
  assert.equal(ticket.formFields.Signature, undefined)
  assert.equal(JSON.stringify(ticket).includes('temporary-secret'), false)
})

test('OSS private operations use the internal endpoint while signed client access uses the public host', async () => {
  const requests = []
  const media = new OssMediaService({
    config, credentials, now: () => Date.parse('2026-08-12T10:00:00.000Z'),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), method: options.method })
      return { ok: true, status: 204, headers: new Headers() }
    }
  })
  await media.delete('oss://bucket/practice/subject-1/task-1/source.png')
  const access = await media.createAccess('oss://bucket/practice/subject-1/task-1/source.png')
  assert.match(requests[0].url, /^https:\/\/bucket\.oss-cn-hangzhou-internal\.aliyuncs\.com\//)
  assert.match(access.url, /^https:\/\/bucket\.oss-cn-hangzhou\.aliyuncs\.com\//)
  assert.doesNotMatch(access.url, /-internal\./)
})

test('OSS verification binds owner, media id, object size and ETag', async () => {
  const responses = [
    { status: 404, ok: false, headers: new Headers() },
    { status: 200, ok: true, headers: new Headers({ 'content-length': '1024', etag: '"etag-value"' }) }
  ]
  const media = new OssMediaService({ config, credentials, fetchImpl: async () => responses.shift() })
  const result = await media.verifyUpload({
    subjectId: 'subject-1', mediaId: 'media_task-1_source', etag: 'etag-value',
    task: {
      taskId: 'task-1', subjectId: 'subject-1', privateUploadPath: 'practice/subject-1/task-1/source',
      uploadPolicy: { maxBytes: 4096, allowedExtensions: ['jpg', 'png'] }
    }
  })
  assert.equal(result.privateObjectRef, 'oss://bucket/practice/subject-1/task-1/source.png')
  assert.equal(result.extension, 'png')
  assert.equal(await media.verifyUpload({ subjectId: 'other', mediaId: 'media_task-1_source', task: { subjectId: 'subject-1' } }), false)
})
