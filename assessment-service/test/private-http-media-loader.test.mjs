import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { PrivateHttpMediaLoader } from '../src/image/private-http-media-loader.mjs'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const now = Date.parse('2026-08-11T10:00:00.000Z')
const access = {
  url: 'https://private-media.example/practice/source.jpg?temporary=secret',
  expiresAt: '2026-08-11T10:10:00.000Z'
}

const taskFor = (image, overrides = {}) => ({
  taskId: 'task-private-media',
  imageSha256: sha256(image),
  mediaAccess: access,
  ...overrides
})

test('private media loader uses a no-redirect bounded request and verifies the digest', async () => {
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  let request
  const loader = new PrivateHttpMediaLoader({
    allowedHosts: ['private-media.example'],
    clock: () => now,
    fetchImpl: async (url, options) => {
      request = { url, options }
      return new Response(image, {
        status: 200,
        headers: { 'content-length': String(image.length), 'content-type': 'image/jpeg' }
      })
    }
  })
  assert.deepEqual(await loader.load(taskFor(image)), image)
  assert.equal(request.url.hostname, 'private-media.example')
  assert.equal(request.options.redirect, 'error')
  assert.equal(request.options.headers.accept, 'image/jpeg, image/png')
})

test('private media loader rejects expired, unapproved-host and digest-mismatched grants without exposing URLs', async () => {
  const image = Buffer.from('private image bytes')
  const loader = new PrivateHttpMediaLoader({
    allowedHosts: ['private-media.example'],
    clock: () => now,
    fetchImpl: async () => new Response(image, { status: 200 })
  })
  await assert.rejects(
    loader.load(taskFor(image, { mediaAccess: { ...access, expiresAt: '2026-08-11T09:59:00.000Z' } })),
    (error) => error.code === 'MEDIA_ACCESS_EXPIRED' && error.retryable === true
  )
  await assert.rejects(
    loader.load(taskFor(image, { mediaAccess: { ...access, url: 'https://attacker.example/source.jpg' } })),
    (error) => error.code === 'MEDIA_HOST_FORBIDDEN'
  )
  await assert.rejects(
    loader.load(taskFor(Buffer.from('different digest'))),
    (error) => error.code === 'MEDIA_DIGEST_MISMATCH'
      && !error.message.includes('private-media.example')
      && !error.message.includes('temporary=secret')
  )
})

test('private media loader rejects announced and streamed bodies above the configured bound', async () => {
  const image = Buffer.from('123456')
  const announced = new PrivateHttpMediaLoader({
    allowedHosts: ['private-media.example'], maximumBytes: 5, clock: () => now,
    fetchImpl: async () => new Response(image, { status: 200, headers: { 'content-length': '6' } })
  })
  await assert.rejects(
    announced.load(taskFor(image)),
    (error) => error.code === 'IMAGE_FILE_TOO_LARGE' && error.retryable === false
  )
  const streamed = new PrivateHttpMediaLoader({
    allowedHosts: ['private-media.example'], maximumBytes: 5, clock: () => now,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from('123'))
        controller.enqueue(Buffer.from('456'))
        controller.close()
      }
    }), { status: 200 })
  })
  await assert.rejects(
    streamed.load(taskFor(image)),
    (error) => error.code === 'IMAGE_FILE_TOO_LARGE' && error.retryable === false
  )
})

test('private media loader does not follow redirects', async () => {
  const image = Buffer.from('image')
  const loader = new PrivateHttpMediaLoader({
    allowedHosts: ['private-media.example'], clock: () => now,
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error')
      return new Response(null, { status: 302, headers: { location: 'https://attacker.example/image' } })
    }
  })
  await assert.rejects(
    loader.load(taskFor(image)),
    (error) => error.code === 'MEDIA_DOWNLOAD_FAILED' && error.retryable === false
  )
})

test('private media loader converts aborts into a bounded retryable timeout', async () => {
  const image = Buffer.from('image')
  const loader = new PrivateHttpMediaLoader({
    allowedHosts: ['private-media.example'], timeoutMs: 5, clock: () => now,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('request details must remain private')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    })
  })
  await assert.rejects(
    loader.load(taskFor(image)),
    (error) => error.code === 'MEDIA_DOWNLOAD_TIMEOUT'
      && error.retryable === true
      && !error.message.includes('request details')
  )
})
