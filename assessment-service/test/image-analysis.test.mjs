import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { DeterministicGridSegmenter } from '../src/image/grid-segmenter.mjs'
import { decodePngRgba } from '../src/image/png-rgba.mjs'
import { DeterministicImageQualityAnalyzer } from '../src/image/quality-analyzer.mjs'

const load = async (name) => decodePngRgba(await readFile(
  new URL(`../../harness/fixtures/inputs/${name}`, import.meta.url)
))

test('quality analyzer reproduces all approved synthetic quality outcomes from pixels', async () => {
  const analyzer = new DeterministicImageQualityAnalyzer()
  const clear = analyzer.inspect(await load('multi-grid-clear-v1.png'))
  const blurred = analyzer.inspect(await load('multi-grid-blurred-v1.png'))
  const cropped = analyzer.inspect(await load('multi-grid-cropped-v1.png'))
  assert.equal(clear.accepted, true)
  assert.equal(clear.reason, null)
  assert.ok(clear.metrics.laplacianVariance > 100)
  assert.deepEqual(
    [blurred.accepted, blurred.reason, cropped.accepted, cropped.reason],
    [false, 'IMAGE_BLUR', false, 'GRID_INCOMPLETE']
  )
  assert.ok(blurred.metrics.laplacianVariance < clear.metrics.laplacianVariance)
})

test('grid segmenter detects the 4 by 4 reading order from red line projections', async () => {
  const image = await load('multi-grid-clear-v1.png')
  const result = new DeterministicGridSegmenter().segment(image)
  assert.equal(result.cells.length, 16)
  assert.deepEqual(result.verticalLines, [80, 440, 799, 1160, 1519])
  assert.deepEqual(result.horizontalLines, [80, 440, 799, 1160, 1519])
  assert.deepEqual(result.cells[0].polygon[0], { x: 80 / 1600, y: 80 / 1600 })
  assert.equal(result.cells[15].cellId, 'r3c3')
})

test('grid segmenter rejects a cropped grid instead of inventing missing cells', async () => {
  const image = await load('multi-grid-cropped-v1.png')
  assert.throws(() => new DeterministicGridSegmenter().segment(image), /GRID_SEGMENTATION_FAILED/)
})
