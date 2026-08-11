import assert from 'node:assert/strict'
import test from 'node:test'

import { encodeRgbaPng } from '../src/image/cell-image.mjs'
import { PixelGlyphFeatureProvider } from '../src/image/pixel-glyph-feature-provider.mjs'

const SIZE = 96

const canvas = () => ({
  width: SIZE,
  height: SIZE,
  channels: 4,
  data: Buffer.alloc(SIZE * SIZE * 4, 255)
})

const rectangle = (image, left, top, right, bottom) => {
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 4
      image.data[offset] = 0
      image.data[offset + 1] = 0
      image.data[offset + 2] = 0
      image.data[offset + 3] = 255
    }
  }
  return image
}

const cross = ({ offsetX = 0, offsetY = 0, scale = 1 } = {}) => {
  const image = canvas()
  const halfLength = Math.round(25 * scale)
  const halfWidth = Math.max(2, Math.round(4 * scale))
  const centerX = 48 + offsetX
  const centerY = 48 + offsetY
  rectangle(image, centerX - halfWidth, centerY - halfLength, centerX + halfWidth, centerY + halfLength)
  rectangle(image, centerX - halfLength, centerY - halfWidth, centerX + halfLength, centerY + halfWidth)
  return image
}

const pngBase64 = (image) => encodeRgbaPng(image).toString('base64')
const pngDataUrl = (image) => `data:image/png;base64,${pngBase64(image)}`

const providerFor = (reference = cross()) => {
  const glyphProvider = {
    version: 'synthetic-glyph-v1',
    async render() {
      return { dataUrl: pngDataUrl(reference), version: this.version }
    }
  }
  return new PixelGlyphFeatureProvider({ glyphProvider })
}

const analyze = (provider, image) => provider.analyzeCell({
  cell: { imageBase64: pngBase64(image) },
  expectedCharacter: '永'
})

test('identical synthetic handwriting and glyph produce complete versioned static-dimension evidence', async () => {
  const result = await analyze(providerFor(), cross())
  assert.deepEqual(result.dimensions, {
    strokeStandard: 100,
    frameStructure: 100,
    glyphProportion: 100,
    positionLayout: 100
  })
  assert.deepEqual(result.issueCodes, [])
  assert.equal(result.featureVersion, 'pixel-glyph-features-v1+synthetic-glyph-v1')
  assert.equal(result.glyphVersion, 'synthetic-glyph-v1')
  assert.equal(result.features.maskIoU, 1)
  assert.equal(result.features.skeletonF1, 1)
  assert.equal(JSON.stringify(result).includes('data:image/'), false)
  assert.equal(JSON.stringify(result).includes('imageBase64'), false)
})

test('synthetic translation lowers position score and emits directional layout evidence', async () => {
  const centered = await analyze(providerFor(), cross())
  const shifted = await analyze(providerFor(), cross({ offsetX: -14, offsetY: 10 }))
  assert.ok(shifted.dimensions.positionLayout < centered.dimensions.positionLayout)
  assert.ok(shifted.issueCodes.includes('CENTER_OFFSET_LEFT'))
  assert.ok(shifted.issueCodes.includes('CENTER_OFFSET_DOWN'))
  assert.ok(shifted.features.centerOffsetX < -0.06)
  assert.ok(shifted.features.centerOffsetY > 0.06)
})

test('synthetic scale and structural changes affect their corresponding dimensions', async () => {
  const provider = providerFor()
  const large = await analyze(provider, cross({ scale: 1.45 }))
  assert.ok(large.issueCodes.includes('GLYPH_TOO_LARGE'))
  assert.ok(large.dimensions.glyphProportion < 100)

  const horizontalOnly = canvas()
  rectangle(horizontalOnly, 18, 43, 78, 53)
  const changed = await analyze(provider, horizontalOnly)
  assert.ok(changed.dimensions.strokeStandard < 75)
  assert.ok(changed.dimensions.frameStructure < 100)
  assert.ok(changed.issueCodes.includes('STROKE_FORM_DIFFERENT'))
})

test('empty handwriting and invalid glyph references fail without inventing scores', async () => {
  await assert.rejects(analyze(providerFor(), canvas()), (error) => error.code === 'GLYPH_INK_EMPTY')
  const invalidProvider = new PixelGlyphFeatureProvider({
    glyphProvider: {
      version: 'synthetic-glyph-v1',
      async render() { return { dataUrl: pngDataUrl(cross()), version: 'wrong-version' } }
    }
  })
  await assert.rejects(analyze(invalidProvider, cross()), (error) => error.code === 'GLYPH_REFERENCE_INVALID')
})
