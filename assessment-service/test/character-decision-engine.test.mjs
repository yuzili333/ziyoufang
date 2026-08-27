import assert from 'node:assert/strict'
import test from 'node:test'

import { DeterministicCharacterDecisionEngine } from '../src/pipeline/character-decision-engine.mjs'

const polygon = [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }
]
const dimensions = {
  strokeStandard: 65,
  frameStructure: 70,
  glyphProportion: 72,
  positionLayout: 80
}

test('wrong characters retain deterministic shape evidence and expose bounded visual annotations', () => {
  const result = new DeterministicCharacterDecisionEngine().decide({
    expectedCharacter: '山',
    polygon,
    ocrResult: {
      index: 0,
      status: 'recognized',
      passes: [{ text: '出', confidence: 0.96 }, { text: '出', confidence: 0.95 }],
      dimensions,
      deterministicIssueCodes: ['GLYPH_TOO_LARGE', 'FRAME_STRUCTURE_DIFFERENT']
    }
  })
  assert.equal(result.category, 'wrong')
  assert.deepEqual(result.issueCodes, [
    'CONTENT_MISMATCH', 'GLYPH_TOO_LARGE', 'FRAME_STRUCTURE_DIFFERENT'
  ])
  assert.deepEqual(result.differenceAnnotations, [
    { code: 'CONTENT_MISMATCH', anchor: 'center', label: '目标字不一致' },
    { code: 'GLYPH_TOO_LARGE', anchor: 'edge', label: '占格偏大' }
  ])
  assert.equal(result.issues.some((item) => item.code === 'FRAME_STRUCTURE_DIFFERENT'), true)
})

test('uncertain and failed characters do not invent visual difference annotations', () => {
  const engine = new DeterministicCharacterDecisionEngine()
  const uncertain = engine.decide({
    expectedCharacter: '山', polygon,
    ocrResult: { index: 0, status: 'recognized', passes: [{ text: '山', confidence: 0.42 }], dimensions: null }
  })
  const failed = engine.decide({
    expectedCharacter: '山', polygon,
    ocrResult: { index: 0, status: 'failed', passes: [], dimensions: null }
  })
  assert.deepEqual(uncertain.differenceAnnotations, [])
  assert.deepEqual(failed.differenceAnnotations, [])
})
