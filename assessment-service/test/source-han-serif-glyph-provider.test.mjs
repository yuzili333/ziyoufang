import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { decodeImageRgba } from '../src/image/image-rgba.mjs'
import {
  SOURCE_HAN_SERIF_SC_FONT_SHA256,
  SourceHanSerifGlyphProvider
} from '../src/providers/source-han-serif-glyph-provider.mjs'

const fontRoot = new URL('../assets/fonts/source-han-serif-sc-2.003R/', import.meta.url)
const fontPath = new URL('SourceHanSerifSC-Regular.otf', fontRoot)
const licensePath = new URL('LICENSE.txt', fontRoot)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const pngBuffer = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64')

test('licensed provider verifies assets and renders a versioned black-on-white reference', async () => {
  const provider = await SourceHanSerifGlyphProvider.create()
  const reference = await provider.render('永', { width: 128, height: 128 })
  assert.equal(provider.version, `source-han-serif-sc-regular@2.003R+${SOURCE_HAN_SERIF_SC_FONT_SHA256}+renderer-v1`)
  assert.equal(reference.version, provider.version)
  assert.match(reference.dataUrl, /^data:image\/png;base64,/)
  assert.equal(sha256(pngBuffer(reference.dataUrl)), '77420e7db3d64c7c3bc15b9efdc19d8a8f41cc8e7e7aa5bce07cab8b75f73f3d')

  const image = decodeImageRgba(pngBuffer(reference.dataUrl))
  assert.deepEqual([image.width, image.height], [128, 128])
  let darkPixels = 0
  let whitePixels = 0
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset] < 32 && image.data[offset + 1] < 32 && image.data[offset + 2] < 32) darkPixels += 1
    if (image.data[offset] > 250 && image.data[offset + 1] > 250 && image.data[offset + 2] > 250) whitePixels += 1
  }
  assert.ok(darkPixels > 100)
  assert.ok(whitePixels > darkPixels)
})

test('fixed character references remain deterministic and concurrent calls share the cache', async () => {
  const provider = await SourceHanSerifGlyphProvider.create()
  const expected = new Map([
    ['永', '77420e7db3d64c7c3bc15b9efdc19d8a8f41cc8e7e7aa5bce07cab8b75f73f3d'],
    ['月', '6a8e9ffba361d564e0165bcb09d2335839070711fc5272abe77441a0f9167e42'],
    ['木', '2b4dc27aa61b1e85732c8dbf1b8be5d47b37a5ad4c9f18e1038bd6b92ec0c691']
  ])
  for (const [character, digest] of expected) {
    const [first, second] = await Promise.all([
      provider.render(character, { width: 128, height: 128 }),
      provider.render(character, { width: 128, height: 128 })
    ])
    assert.equal(first, second)
    assert.equal(sha256(pngBuffer(first.dataUrl)), digest)
  }
  const resized = await provider.render('永', { width: 256, height: 192 })
  assert.deepEqual([decodeImageRgba(pngBuffer(resized.dataUrl)).width, decodeImageRgba(pngBuffer(resized.dataUrl)).height], [256, 192])
})

test('provider fails closed for missing, changed or unsupported resources', async () => {
  await assert.rejects(
    SourceHanSerifGlyphProvider.create({ fontPath: '/private/tmp/ziyoufang-font-does-not-exist.otf' }),
    (error) => error.code === 'GLYPH_FONT_NOT_FOUND'
  )
  await assert.rejects(
    SourceHanSerifGlyphProvider.create({ fontPath, expectedFontSha256: '0'.repeat(64) }),
    (error) => error.code === 'GLYPH_FONT_HASH_MISMATCH'
  )
  await assert.rejects(
    SourceHanSerifGlyphProvider.create({ fontPath, licensePath, expectedLicenseSha256: '0'.repeat(64) }),
    (error) => error.code === 'GLYPH_LICENSE_HASH_MISMATCH'
  )
  const provider = await SourceHanSerifGlyphProvider.create()
  await assert.rejects(provider.render('😀', { width: 128, height: 128 }), (error) => error.code === 'GLYPH_REFERENCE_NOT_FOUND')
  await assert.rejects(provider.render('永', { width: 1, height: 128 }), (error) => error.code === 'GLYPH_DIMENSIONS_INVALID')
})
