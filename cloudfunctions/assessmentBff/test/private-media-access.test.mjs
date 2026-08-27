import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createPrivateMediaAccessResolver } = require('../core/private-media-access')

const task = { sourceMediaId: 'media-1' }
const cloudFileId = 'cloud://private/source.jpg'
const activeMedia = {
  mediaId: 'media-1', privateObjectRef: cloudFileId, lifecycleStatus: 'active',
  expiresAt: '2026-08-12T11:00:00.000Z'
}

test('private media resolver rejects expired metadata before requesting a temporary URL', async () => {
  let providerCalls = 0
  const resolveAccess = createPrivateMediaAccessResolver({
    repository: { getMediaObject: async () => ({ ...activeMedia, expiresAt: '2026-08-12T09:00:00.000Z' }) },
    getTempFileURL: async () => { providerCalls += 1 },
    now: () => Date.parse('2026-08-12T10:00:00.000Z')
  })

  await assert.rejects(resolveAccess({ cloudFileId, task }), /PRIVATE_MEDIA_EXPIRED/)
  assert.equal(providerCalls, 0)
})

test('private media resolver rejects missing, mismatched, or non-active metadata', async () => {
  for (const media of [null, { ...activeMedia, privateObjectRef: 'cloud://other' }, { ...activeMedia, lifecycleStatus: 'storage_deleted' }]) {
    const resolveAccess = createPrivateMediaAccessResolver({
      repository: { getMediaObject: async () => media },
      getTempFileURL: async () => ({ fileList: [] })
    })
    await assert.rejects(resolveAccess({ cloudFileId, task }), /PRIVATE_MEDIA_UNAVAILABLE/)
  }
})

test('private media resolver returns a bounded HTTPS capability for active media', async () => {
  const now = Date.parse('2026-08-12T10:00:00.000Z')
  const resolveAccess = createPrivateMediaAccessResolver({
    repository: { getMediaObject: async () => activeMedia },
    getTempFileURL: async () => ({ fileList: [{
      fileID: cloudFileId, status: 0, tempFileURL: 'https://private.example/source.jpg?token=short'
    }] }),
    now: () => now
  })

  assert.deepEqual(await resolveAccess({ cloudFileId, task }), {
    url: 'https://private.example/source.jpg?token=short',
    expiresAt: '2026-08-12T10:10:00.000Z'
  })
})
