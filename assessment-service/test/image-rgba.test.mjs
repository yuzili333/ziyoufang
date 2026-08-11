import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import jpeg from 'jpeg-js'

import { decodeImageRgba, detectImageFormat, imageLimits } from '../src/image/image-rgba.mjs'
import { decodePngRgba } from '../src/image/png-rgba.mjs'

const fixture = new URL('../../harness/fixtures/inputs/multi-grid-clear-v1.png', import.meta.url)

const withExifOrientation = (encoded, orientation) => {
  const payload = Buffer.alloc(32)
  payload.write('Exif\0\0', 0, 'binary')
  payload.write('II', 6, 'ascii')
  payload.writeUInt16LE(42, 8)
  payload.writeUInt32LE(8, 10)
  payload.writeUInt16LE(1, 14)
  payload.writeUInt16LE(0x0112, 16)
  payload.writeUInt16LE(3, 18)
  payload.writeUInt32LE(1, 20)
  payload.writeUInt16LE(orientation, 24)
  payload.writeUInt32LE(0, 28)
  const header = Buffer.alloc(4)
  header[0] = 0xff
  header[1] = 0xe1
  header.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([encoded.subarray(0, 2), header, payload, encoded.subarray(2)])
}

test('unified decoder sniffs PNG and JPEG bytes instead of trusting a file suffix', async () => {
  const png = await readFile(fixture)
  const rgba = decodePngRgba(png)
  const encodedJpeg = jpeg.encode(rgba, 95).data
  assert.equal(detectImageFormat(png), 'png')
  assert.equal(detectImageFormat(encodedJpeg), 'jpeg')
  assert.equal(detectImageFormat(Buffer.from('image.jpg but not jpeg bytes')), null)
  const decodedPng = decodeImageRgba(png)
  const decodedJpeg = decodeImageRgba(encodedJpeg)
  assert.deepEqual(
    { width: decodedPng.width, height: decodedPng.height, format: decodedPng.format, orientation: decodedPng.orientation },
    { width: 1600, height: 1600, format: 'png', orientation: 1 }
  )
  assert.deepEqual(
    { width: decodedJpeg.width, height: decodedJpeg.height, format: decodedJpeg.format, orientation: decodedJpeg.orientation },
    { width: 1600, height: 1600, format: 'jpeg', orientation: 1 }
  )
})

test('JPEG EXIF orientation is applied before quality analysis and segmentation', () => {
  const source = {
    width: 2,
    height: 3,
    data: Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
      255, 0, 255, 255, 0, 255, 255, 255
    ])
  }
  const encoded = jpeg.encode(source, 100).data
  const decoded = decodeImageRgba(withExifOrientation(encoded, 6))
  assert.deepEqual(
    { width: decoded.width, height: decoded.height, orientation: decoded.orientation },
    { width: 3, height: 2, orientation: 6 }
  )
})

test('unified decoder rejects unsupported, damaged and oversized images with bounded codes', () => {
  assert.throws(() => decodeImageRgba(Buffer.alloc(0)), /IMAGE_INPUT_EMPTY/)
  assert.throws(() => decodeImageRgba(Buffer.from('RIFF....WEBP')), /IMAGE_FORMAT_UNSUPPORTED/)
  assert.throws(
    () => decodeImageRgba(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])),
    /IMAGE_DECODE_FAILED/
  )
  const oversized = Buffer.alloc(imageLimits.maximumEncodedBytes + 1)
  oversized.set([0xff, 0xd8, 0xff])
  assert.throws(() => decodeImageRgba(oversized), /IMAGE_FILE_TOO_LARGE/)
})
