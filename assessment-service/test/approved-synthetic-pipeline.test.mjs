import assert from 'node:assert/strict'
import test from 'node:test'

import { ApprovedFixtureGlyphProvider } from '../src/providers/approved-fixture-glyph-provider.mjs'
import { createApprovedSyntheticPipeline } from '../src/pipeline/approved-synthetic-pipeline.mjs'

test('approved synthetic pipeline executes page-first OCR and pixel glyph scoring end to end', async () => {
  const { provider, fixture } = await createApprovedSyntheticPipeline()
  const response = await provider.assess({
    taskId: 'approved-pixel-task',
    localTaskId: 'approved-pixel-local',
    idempotencyKey: 'approved-pixel-idem',
    imageSha256: fixture.imageSha256,
    expectedText: fixture.targetText,
    resultVersion: 1
  })

  assert.deepEqual(response.result.summary, {
    total: 16, normal: 10, wrong: 1, needsCorrection: 3, uncertain: 1, failed: 1
  })
  assert.deepEqual(new Set(response.result.characters.map((item) => item.category)), new Set([
    'normal', 'wrong', 'needs_correction', 'uncertain', 'failed'
  ]))
  const scored = response.result.characters.filter((item) => item.score !== null)
  assert.equal(scored.every((item) => item.versions.score
    === 'pixel-glyph-features-v1+hanzi-pen-synthetic-reference-v1'), true)
  assert.equal(scored.every((item) => item.versions.glyph === 'hanzi-pen-synthetic-reference-v1'), true)
  assert.equal(response.result.characters[0].issueCodes.includes('STROKE_FORM_DIFFERENT'), true)
  assert.equal(response.result.characters[3].category, 'wrong')
  assert.equal(response.result.characters[3].recognizedCharacter, '出')
  assert.equal(response.result.characters[3].differenceAnnotations.some((item) => item.code === 'CONTENT_MISMATCH'), true)
  assert.equal(response.result.characters.every((item) => item.differenceAnnotations.length <= 3), true)
  assert.equal(response.result.characters[7].category, 'uncertain')
  assert.equal(response.result.characters[14].category, 'failed')
  assert.deepEqual(response.result.characters[7].differenceAnnotations, [])
  assert.deepEqual(response.result.characters[14].differenceAnnotations, [])
  assert.equal(response.evidence.pipelineVersion, 'synthetic-page-ocr-pixel-glyph-pipeline-v2')
  assert.equal(JSON.stringify(response.result).includes('data:image/'), false)
  assert.equal(JSON.stringify(response.result).includes('maskIoU'), false)
})

test('approved fixture glyph provider serves only governed versioned references', async () => {
  const provider = await ApprovedFixtureGlyphProvider.create()
  const reference = await provider.render('永')
  assert.equal(reference.version, 'hanzi-pen-synthetic-reference-v1')
  assert.match(reference.dataUrl, /^data:image\/png;base64,iVBOR/)
  await assert.rejects(provider.render('测'), (error) => error.code === 'GLYPH_REFERENCE_NOT_FOUND')
})
