import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { decodePngRgba, rgbaLuminance } from '../src/image/png-rgba.mjs'

const fixture = (name) => new URL(`../../harness/fixtures/inputs/${name}`, import.meta.url)

test('approved synthetic RGBA fixtures decode with bounded dimensions', async () => {
  const clear = decodePngRgba(await readFile(fixture('multi-grid-clear-v1.png')))
  const blurred = decodePngRgba(await readFile(fixture('multi-grid-blurred-v1.png')))
  const cropped = decodePngRgba(await readFile(fixture('multi-grid-cropped-v1.png')))
  assert.deepEqual({ width: clear.width, height: clear.height, channels: clear.channels }, {
    width: 1600, height: 1600, channels: 4
  })
  assert.deepEqual({ width: blurred.width, height: blurred.height }, { width: 1600, height: 1600 })
  assert.deepEqual({ width: cropped.width, height: cropped.height }, { width: 1280, height: 1600 })
  assert.equal(clear.data.length, 1600 * 1600 * 4)
  assert.ok(rgbaLuminance(clear.data, 0) >= 0)
})

test('decoder rejects unsupported or malformed content before allocation', () => {
  assert.throws(() => decodePngRgba(Buffer.from('not a png')), /PNG_SIGNATURE_INVALID/)
  const oversizedHeader = Buffer.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0x20, 0, 0, 0, 0x20, 0, 8, 6, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0
  ])
  assert.throws(() => decodePngRgba(oversizedHeader), /PNG_PIXEL_LIMIT_EXCEEDED/)
})
