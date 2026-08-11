import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { createCellVisualEvidence, cropCellRgba, encodeRgbaPng } from '../src/image/cell-image.mjs'
import { DeterministicGridSegmenter } from '../src/image/grid-segmenter.mjs'
import { decodePngRgba } from '../src/image/png-rgba.mjs'

const fixture = new URL('../../harness/fixtures/inputs/multi-grid-clear-v1.png', import.meta.url)

test('cell crop removes grid edges and round-trips through the bounded PNG encoder', async () => {
  const page = decodePngRgba(await readFile(fixture))
  const cell = new DeterministicGridSegmenter().segment(page).cells[0]
  const crop = cropCellRgba(page, cell.pixelBounds)
  assert.deepEqual({ width: crop.width, height: crop.height, channels: crop.channels }, {
    width: 344, height: 344, channels: 4
  })
  const encoded = encodeRgbaPng(crop)
  const decoded = decodePngRgba(encoded)
  assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 344, height: 344 })
  assert.deepEqual(decoded.data, crop.data)
})

test('large cell crops are resized within the OCR and model evidence bounds', async () => {
  const page = decodePngRgba(await readFile(fixture))
  const crop = cropCellRgba(page, {
    left: 0, top: 0, right: page.width, bottom: page.height
  }, { insetRatio: 0 })
  assert.deepEqual({ width: crop.width, height: crop.height }, { width: 1024, height: 1024 })
  assert.equal(crop.data.length, 1024 * 1024 * 4)
})

test('cell visual evidence carries provider-only base64 and rejects invalid bounds', async () => {
  const page = decodePngRgba(await readFile(fixture))
  const cells = new DeterministicGridSegmenter().segment(page).cells.slice(0, 2)
  const evidence = createCellVisualEvidence(page, cells)
  assert.equal(evidence.length, 2)
  assert.match(evidence[0].imageBase64, /^iVBOR/)
  assert.equal(evidence[0].cropImageDataUrl, `data:image/png;base64,${evidence[0].imageBase64}`)
  assert.throws(
    () => cropCellRgba(page, { left: -1, top: 0, right: 10, bottom: 10 }),
    (error) => error.code === 'CELL_BOUNDS_INVALID'
  )
  assert.throws(
    () => cropCellRgba(page, { left: 10, top: 10, right: 10, bottom: 20 }),
    (error) => error.code === 'CELL_BOUNDS_INVALID'
  )
})
