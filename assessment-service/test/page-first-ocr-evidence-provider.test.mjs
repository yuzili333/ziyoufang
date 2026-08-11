import assert from 'node:assert/strict'
import test from 'node:test'

import { PageFirstOcrEvidenceProvider } from '../src/providers/page-first-ocr-evidence-provider.mjs'
import { DeterministicCharacterDecisionEngine } from '../src/pipeline/character-decision-engine.mjs'

const polygon = (left, right) => [
  { x: left, y: 0 }, { x: right, y: 0 }, { x: right, y: 1 }, { x: left, y: 1 }
]
const word = (text, confidence, left, right) => ({ text, confidence, polygon: polygon(left, right) })
const cell = (index, left, right) => ({
  cellId: `cell-${index}`,
  index,
  polygon: polygon(left, right),
  imageBase64: 'iVBORw0KGgo=',
  imageWidth: 100,
  imageHeight: 100
})
const dimensions = {
  strokeStandard: 90,
  frameStructure: 90,
  glyphProportion: 90,
  positionLayout: 90
}
const featureProvider = {
  version: 'feature-test-v1',
  glyphProvider: { version: 'glyph-test-v1' },
  async analyzeCell() {
    return {
      dimensions,
      issueCodes: [],
      features: { maskIoU: 0.91 },
      featureVersion: 'feature-test-v1',
      glyphVersion: 'glyph-test-v1'
    }
  }
}
const page = { imageBase64: 'iVBORw0KGgo=', imageWidth: 200, imageHeight: 100 }

test('page-first OCR retries a suspected wrong cell and preserves the two-evidence wrong rule', async () => {
  const cells = [cell(0, 0, 0.5), cell(1, 0.5, 1)]
  const retryBatches = []
  const rawProvider = {
    name: 'raw-test', version: 'raw-test-v1',
    async recognizePage() {
      return { lines: [{ words: [word('永', 0.96, 0.1, 0.4), word('出', 0.95, 0.6, 0.9)] }] }
    },
    async recognizeCells({ cells: batch }) {
      retryBatches.push(batch.map((item) => item.cellId))
      return batch.map((item) => ({
        cellId: item.cellId,
        text: '出',
        lines: [{ confidence: 0.94, words: [word('出', 0.94, 0, 1)] }]
      }))
    }
  }
  const provider = new PageFirstOcrEvidenceProvider({ rawProvider, featureProvider })
  const evidence = await provider.recognizePageWithCells({ page, cells, expectedCharacters: ['永', '山'] })
  assert.deepEqual(retryBatches, [['cell-1']])
  assert.equal(evidence[0].passes.length, 1)
  assert.equal(evidence[0].deterministicFeatures.maskIoU, 0.91)
  assert.equal(evidence[0].featureVersion, 'feature-test-v1')
  assert.equal(evidence[0].glyphVersion, 'glyph-test-v1')
  assert.equal(provider.scoreVersion, 'feature-test-v1')
  assert.equal(provider.glyphVersion, 'glyph-test-v1')
  assert.equal(evidence[1].passes.length, 2)
  const engine = new DeterministicCharacterDecisionEngine()
  assert.equal(engine.decide({ expectedCharacter: '永', ocrResult: evidence[0], polygon: cells[0].polygon }).category, 'normal')
  const wrong = engine.decide({ expectedCharacter: '山', ocrResult: evidence[1], polygon: cells[1].polygon })
  assert.equal(wrong.category, 'wrong')
  assert.equal(wrong.recognizedCharacter, '出')
})

test('low confidence and page conflicts remain uncertain while a missing page word can recover from a cell retry', async () => {
  const cells = [cell(0, 0, 0.33), cell(1, 0.33, 0.66), cell(2, 0.66, 1)]
  const rawProvider = {
    name: 'raw-test', version: 'raw-test-v1',
    async recognizePage() {
      return { lines: [{ words: [
        word('永', 0.5, 0.05, 0.25),
        word('山', 0.94, 0.36, 0.48),
        word('出', 0.93, 0.51, 0.63)
      ] }] }
    },
    async recognizeCells({ cells: batch }) {
      return batch.map((item) => {
        const candidate = item.index === 0 ? '永' : item.index === 1 ? '山' : '月'
        return {
          cellId: item.cellId,
          text: candidate,
          lines: [{ confidence: 0.98, words: [word(candidate, 0.98, 0, 1)] }]
        }
      })
    }
  }
  const provider = new PageFirstOcrEvidenceProvider({ rawProvider, featureProvider })
  const evidence = await provider.recognizePageWithCells({ page, cells, expectedCharacters: ['永', '山', '月'] })
  const engine = new DeterministicCharacterDecisionEngine()
  assert.equal(engine.decide({ expectedCharacter: '永', ocrResult: evidence[0], polygon: cells[0].polygon }).category, 'uncertain')
  assert.equal(engine.decide({ expectedCharacter: '山', ocrResult: evidence[1], polygon: cells[1].polygon }).category, 'uncertain')
  assert.equal(evidence[2].passes.length, 1)
  assert.equal(engine.decide({ expectedCharacter: '月', ocrResult: evidence[2], polygon: cells[2].polygon }).category, 'normal')
})

test('cell retries remain bounded to batches of 32', async () => {
  const cells = Array.from({ length: 40 }, (_, index) => cell(index, index / 40, (index + 1) / 40))
  const batches = []
  const rawProvider = {
    name: 'raw-test', version: 'raw-test-v1',
    async recognizePage() { return { lines: [] } },
    async recognizeCells({ cells: batch }) {
      batches.push(batch.length)
      return batch.map((item) => ({
        cellId: item.cellId,
        text: '永',
        lines: [{ confidence: 0.99, words: [word('永', 0.99, 0, 1)] }]
      }))
    }
  }
  const provider = new PageFirstOcrEvidenceProvider({ rawProvider, featureProvider })
  const evidence = await provider.recognizePageWithCells({
    page,
    cells,
    expectedCharacters: Array(40).fill('永')
  })
  assert.deepEqual(batches, [32, 8])
  assert.equal(evidence.length, 40)
})

test('cell retry responses must preserve the requested cell identity set', async () => {
  const cells = [cell(0, 0, 0.5), cell(1, 0.5, 1)]
  const provider = new PageFirstOcrEvidenceProvider({
    featureProvider,
    rawProvider: {
      name: 'raw-test', version: 'raw-test-v1',
      async recognizePage() { return { lines: [] } },
      async recognizeCells() {
        return [
          { cellId: 'cell-0', text: '永', lines: [{ confidence: 0.99 }] },
          { cellId: 'cell-0', text: '山', lines: [{ confidence: 0.99 }] }
        ]
      }
    }
  })
  await assert.rejects(
    provider.recognizePageWithCells({ page, cells, expectedCharacters: ['永', '山'] }),
    (error) => error.code === 'OCR_CELL_ID_MISMATCH' && error.retryable === true
  )
})
