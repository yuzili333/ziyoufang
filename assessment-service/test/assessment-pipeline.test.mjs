import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import jpeg from 'jpeg-js'

import { decodePngRgba } from '../src/image/png-rgba.mjs'
import { encodeRgbaPng } from '../src/image/cell-image.mjs'
import { PrivateHttpMediaLoader } from '../src/image/private-http-media-loader.mjs'
import { DeterministicGridSegmenter } from '../src/image/grid-segmenter.mjs'
import { DeterministicImageQualityAnalyzer } from '../src/image/quality-analyzer.mjs'
import { AssessmentOrchestrator } from '../src/orchestrator.mjs'
import {
  AssessmentPipelineProvider,
  InMemoryMediaLoader
} from '../src/pipeline/assessment-pipeline-provider.mjs'
import { DeterministicCharacterDecisionEngine } from '../src/pipeline/character-decision-engine.mjs'
import { SyntheticFixtureOcrProvider } from '../src/pipeline/synthetic-fixture-ocr-provider.mjs'
import { RuleTemplateCorrectionProvider } from '../src/providers/rule-template-correction-provider.mjs'
import { FallbackVisionCorrectionProvider } from '../src/providers/rule-template-correction-provider.mjs'
import { HunyuanVisionCorrectionProvider } from '../src/providers/hunyuan-vision-correction-provider.mjs'
import { MemoryAssessmentRepository } from '../src/repository.mjs'
import { SafeTelemetry } from '../src/telemetry.mjs'

const targetText = '永和春山日月天地人心正学书法美华'
const renderedText = '永和春出日月天地人心正学书法美华'
const fixtureUrl = (name) => new URL(`../../harness/fixtures/inputs/${name}`, import.meta.url)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const taskFor = (imageSha256, suffix = 'clear') => ({
  taskId: `pipeline-task-${suffix}`,
  localTaskId: `pipeline-local-${suffix}`,
  idempotencyKey: `pipeline-idem-${suffix}`,
  subjectId: 'subject-synthetic',
  imageSha256,
  expectedText: targetText,
  resultVersion: 1
})

const createPipeline = (entries, mediaLoader = new InMemoryMediaLoader(entries), overrides = {}) => new AssessmentPipelineProvider({
  mediaLoader,
  qualityAnalyzer: new DeterministicImageQualityAnalyzer(),
  segmenter: new DeterministicGridSegmenter(),
  ocrProvider: new SyntheticFixtureOcrProvider({ renderedText }),
  decisionEngine: new DeterministicCharacterDecisionEngine(),
  adviceProvider: new RuleTemplateCorrectionProvider({ version: 'rule-template-pipeline-v1' }),
  ...overrides
})

test('pixel-backed synthetic pipeline produces all MVP result classes and deterministic evidence', async () => {
  const clear = await readFile(fixtureUrl('multi-grid-clear-v1.png'))
  const imageSha256 = sha256(clear)
  const pipeline = createPipeline([[imageSha256, clear]])
  const stages = []
  const response = await pipeline.assess(taskFor(imageSha256), {
    onProgress: async (stage) => stages.push(stage)
  })
  assert.deepEqual(stages, [
    'quality_checking', 'segmenting', 'recognizing', 'comparing',
    'generating_advice', 'persisting_result'
  ])
  assert.equal(response.result.status, 'partially_completed')
  assert.deepEqual(response.result.summary, {
    total: 16, normal: 9, wrong: 1, needsCorrection: 4, uncertain: 1, failed: 1
  })
  assert.deepEqual(response.result.characters.map((item) => item.category), [
    'needs_correction', 'normal', 'normal', 'wrong',
    'normal', 'needs_correction', 'normal', 'uncertain',
    'normal', 'needs_correction', 'normal', 'normal',
    'normal', 'needs_correction', 'failed', 'normal'
  ])
  const wrong = response.result.characters[3]
  assert.equal(wrong.expectedCharacter, '山')
  assert.equal(wrong.recognizedCharacter, '出')
  assert.equal(wrong.score, 38)
  assert.deepEqual(wrong.issueCodes, ['CONTENT_MISMATCH'])
  assert.ok(wrong.correctionSteps.length > 0)
  assert.equal(response.result.characters[7].score, null)
  assert.equal(response.result.characters[7].needsRetry, true)
  assert.deepEqual(response.result.characters[14].issueCodes, ['CELL_PROCESSING_FAILED'])
  assert.equal(response.evidence.qualityMetrics.width, 1600)
  assert.deepEqual(response.evidence.segmentationMetrics, {
    detectedRows: 4, detectedColumns: 4, cellCount: 16
  })
  assert.equal(response.usage.costMicros, 0)
  assert.equal(response.usage.pricingVersion, 'synthetic-zero-cost-v1')
})

test('pixel-backed pipeline accepts a JPEG phone-photo payload through the same deterministic stages', async () => {
  const png = await readFile(fixtureUrl('multi-grid-clear-v1.png'))
  const jpegImage = jpeg.encode(decodePngRgba(png), 95).data
  const imageSha256 = sha256(jpegImage)
  const mediaAccess = {
    url: 'https://private-media.example/source.jpg?temporary=synthetic',
    expiresAt: '2026-08-11T10:10:00.000Z'
  }
  const loader = new PrivateHttpMediaLoader({
    allowedHosts: ['private-media.example'],
    clock: () => Date.parse('2026-08-11T10:00:00.000Z'),
    fetchImpl: async () => new Response(jpegImage, { status: 200 })
  })
  const response = await createPipeline([], loader).assess({
    ...taskFor(imageSha256, 'jpeg'),
    mediaAccess
  })
  assert.equal(response.result.characters.length, 16)
  assert.equal(response.evidence.sourceImageFormat, 'jpeg')
  assert.equal(response.evidence.sourceOrientation, 1)
  assert.deepEqual(response.evidence.segmentationMetrics, {
    detectedRows: 4, detectedColumns: 4, cellCount: 16
  })
})

test('pipeline passes real cell pixels to OCR and bounded visual evidence to the advice provider', async () => {
  const clear = await readFile(fixtureUrl('multi-grid-clear-v1.png'))
  const imageSha256 = sha256(clear)
  const syntheticOcr = new SyntheticFixtureOcrProvider({ renderedText })
  const observedOcrBatches = []
  const ocrProvider = {
    name: syntheticOcr.name,
    version: syntheticOcr.version,
    async recognizeCells(input) {
      observedOcrBatches.push(input.cells)
      return (await syntheticOcr.recognizeCells(input)).map((item) => ({
        ...item,
        deterministicFeatures: { maskIoU: 0.8125, skeletonF1: 0.75 }
      }))
    }
  }
  const ruleAdvice = new RuleTemplateCorrectionProvider({ version: 'visual-rule-v1' })
  const observedAdviceBatches = []
  const adviceProvider = {
    name: 'visual-advice-test',
    version: 'visual-advice-test-v1',
    requiresVisualEvidence: true,
    async analyzeBatch(input) {
      observedAdviceBatches.push(input.items)
      return ruleAdvice.analyzeBatch(input)
    }
  }
  const glyphDataUrl = `data:image/png;base64,${encodeRgbaPng({
    width: 1, height: 1, channels: 4, data: Buffer.from([0, 0, 0, 255])
  }).toString('base64')}`
  const glyphCalls = []
  const glyphProvider = {
    version: 'synthetic-glyph-reference-v1',
    async render(character, dimensions) {
      glyphCalls.push({ character, dimensions })
      return { dataUrl: glyphDataUrl, version: this.version }
    }
  }
  const response = await createPipeline([[imageSha256, clear]], undefined, {
    ocrProvider,
    adviceProvider,
    glyphProvider
  }).assess(taskFor(imageSha256, 'visual-evidence'))
  const ocrCells = observedOcrBatches.flat()
  assert.equal(ocrCells.length, 16)
  assert.equal(observedOcrBatches.every((batch) => batch.length <= 32), true)
  assert.equal(ocrCells.every((cell) => cell.imageBase64.startsWith('iVBOR')), true)
  assert.equal(ocrCells.every((cell) => cell.imageWidth > 0 && cell.imageHeight > 0), true)
  const adviceItems = observedAdviceBatches.flat()
  assert.equal(adviceItems.length, glyphCalls.length)
  assert.equal(adviceItems.every((item) => item.cropImageDataUrl.startsWith('data:image/png;base64,')), true)
  assert.equal(adviceItems.every((item) => item.glyphImageDataUrl === glyphDataUrl), true)
  assert.equal(adviceItems.every((item) => item.expectedCharacter && Array.isArray(item.ocrCandidates)), true)
  assert.equal(adviceItems.every((item) => item.features.maskIoU === 0.8125), true)
  assert.equal(adviceItems.every((item) => item.features.skeletonF1 === 0.75), true)
  assert.equal(response.result.characters[0].versions.glyph, 'synthetic-glyph-reference-v1')
  assert.equal(JSON.stringify(response.result).includes('maskIoU'), false)
  assert.equal(JSON.stringify(response.result).includes('data:image/'), false)
  assert.equal(JSON.stringify(response.result).includes('imageBase64'), false)
})

test('pipeline degrades to rule advice when a visual model has no approved glyph provider', async () => {
  const clear = await readFile(fixtureUrl('multi-grid-clear-v1.png'))
  const imageSha256 = sha256(clear)
  const adviceProvider = new FallbackVisionCorrectionProvider({
    primary: new HunyuanVisionCorrectionProvider(),
    fallback: new RuleTemplateCorrectionProvider({ version: 'no-glyph-fallback-v1' })
  })
  const response = await createPipeline([[imageSha256, clear]], undefined, { adviceProvider })
    .assess(taskFor(imageSha256, 'no-glyph-fallback'))
  assert.equal(response.result.status, 'partially_completed')
  assert.ok(response.result.characters[0].correctionSteps.length > 0)
})

test('pipeline keeps OCR cell requests within batches of 32', async () => {
  const page = {
    width: 20,
    height: 20,
    channels: 4,
    data: Buffer.alloc(20 * 20 * 4, 255)
  }
  const encoded = encodeRgbaPng(page)
  const imageSha256 = sha256(encoded)
  const cells = Array.from({ length: 40 }, (_, index) => ({
    cellId: `cell-${index}`,
    index,
    pixelBounds: { left: 0, top: 0, right: 20, bottom: 20 },
    polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
  }))
  const batchSizes = []
  const pipeline = new AssessmentPipelineProvider({
    mediaLoader: new InMemoryMediaLoader([[imageSha256, encoded]]),
    qualityAnalyzer: { inspect: () => ({ accepted: true, qualityVersion: 'test', metrics: {} }) },
    segmenter: {
      segment: () => ({
        cells,
        segmenterVersion: 'forty-cell-test-v1',
        metrics: { detectedRows: 5, detectedColumns: 8, cellCount: 40 }
      })
    },
    ocrProvider: {
      name: 'forty-cell-ocr',
      version: 'forty-cell-ocr-v1',
      async recognizeCells({ cells: batch }) {
        batchSizes.push(batch.length)
        return batch.map((cell) => ({
          cellId: cell.cellId,
          index: cell.index,
          status: 'recognized',
          passes: [{ text: '永', confidence: 0.99 }, { text: '永', confidence: 0.98 }],
          dimensions: {
            strokeStandard: 90, frameStructure: 90, glyphProportion: 90, positionLayout: 90
          },
          deterministicIssueCodes: []
        }))
      }
    },
    decisionEngine: new DeterministicCharacterDecisionEngine(),
    adviceProvider: new RuleTemplateCorrectionProvider()
  })
  const response = await pipeline.assess({
    ...taskFor(imageSha256, 'forty-cells'),
    expectedText: '永'.repeat(40)
  })
  assert.deepEqual(batchSizes, [32, 8])
  assert.equal(response.result.characters.length, 40)
})

test('pipeline supplies an oriented page image and expected characters to a page-first OCR adapter', async () => {
  const clear = await readFile(fixtureUrl('multi-grid-clear-v1.png'))
  const imageSha256 = sha256(clear)
  const syntheticOcr = new SyntheticFixtureOcrProvider({ renderedText })
  let captured
  const ocrProvider = {
    name: 'page-first-test',
    version: 'page-first-test-v1',
    async recognizePageWithCells(input) {
      captured = input
      return syntheticOcr.recognizeCells({ cells: input.cells })
    }
  }
  const response = await createPipeline([[imageSha256, clear]], undefined, { ocrProvider })
    .assess(taskFor(imageSha256, 'page-first'))
  const pageImage = decodePngRgba(Buffer.from(captured.page.imageBase64, 'base64'))
  assert.deepEqual(
    { width: pageImage.width, height: pageImage.height },
    { width: captured.page.imageWidth, height: captured.page.imageHeight }
  )
  assert.deepEqual(captured.expectedCharacters, [...targetText])
  assert.equal(captured.cells.every((cell) => cell.imageBase64.startsWith('iVBOR')), true)
  assert.equal(response.result.characters.length, 16)
})

test('orchestrator persists real pipeline stages and the final partial result', async () => {
  const clear = await readFile(fixtureUrl('multi-grid-clear-v1.png'))
  const imageSha256 = sha256(clear)
  const updates = []
  class RecordingRepository extends MemoryAssessmentRepository {
    async update(taskId, patch) {
      updates.push(structuredClone(patch))
      return super.update(taskId, patch)
    }
  }
  const repository = new RecordingRepository()
  const telemetry = new SafeTelemetry({ taskHashSecret: 'pipeline-test-secret' })
  const orchestrator = new AssessmentOrchestrator({
    repository,
    provider: createPipeline([[imageSha256, clear]]),
    telemetry
  })
  await orchestrator.accept(taskFor(imageSha256, 'orchestrated'))
  const result = await orchestrator.process('pipeline-task-orchestrated')
  assert.equal(result.status, 'partially_completed')
  assert.deepEqual(updates.filter((patch) => patch.progressStage).map((patch) => patch.progressStage), [
    'quality_checking', 'segmenting', 'recognizing', 'comparing',
    'generating_advice', 'persisting_result', 'finished'
  ])
  assert.equal(telemetry.snapshot().countsByType.assessment_completed, 1)
})

test('blurred and cropped pages stop before OCR with non-retryable quality guidance', async () => {
  for (const [name, expectedCode] of [
    ['multi-grid-blurred-v1.png', 'IMAGE_BLUR'],
    ['multi-grid-cropped-v1.png', 'GRID_INCOMPLETE']
  ]) {
    const image = await readFile(fixtureUrl(name))
    const imageSha256 = sha256(image)
    const repository = new MemoryAssessmentRepository()
    const orchestrator = new AssessmentOrchestrator({
      repository,
      provider: createPipeline([[imageSha256, image]])
    })
    const task = taskFor(imageSha256, expectedCode.toLowerCase())
    await orchestrator.accept(task)
    const result = await orchestrator.process(task.taskId)
    assert.equal(result.status, 'failed')
    assert.equal(result.retryable, false)
    assert.equal(result.errorCode, expectedCode)
    assert.equal(result.progressStage, 'finished')
  }
})

test('pipeline rejects a target longer than detected cells without truncating the target', async () => {
  const clear = await readFile(fixtureUrl('multi-grid-clear-v1.png'))
  const imageSha256 = sha256(clear)
  const pipeline = createPipeline([[imageSha256, clear]])
  await assert.rejects(
    pipeline.assess({ ...taskFor(imageSha256), expectedText: `${targetText}多` }),
    (error) => error.code === 'TARGET_TEXT_EXCEEDS_GRID' && error.retryable === false
  )
})

test('pipeline classifies unsupported or damaged image bytes as non-retryable input failures', async () => {
  for (const [suffix, image, expectedCode] of [
    ['unsupported-format', Buffer.from('RIFF....WEBP'), 'IMAGE_FORMAT_UNSUPPORTED'],
    ['damaged-jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), 'IMAGE_DECODE_FAILED']
  ]) {
    const imageSha256 = sha256(image)
    await assert.rejects(
      createPipeline([[imageSha256, image]]).assess(taskFor(imageSha256, suffix)),
      (error) => error.code === expectedCode && error.retryable === false
    )
  }
})
