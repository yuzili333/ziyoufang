import { decodeImageRgba } from '../image/image-rgba.mjs'
import { createCellVisualEvidence, encodeRgbaPng } from '../image/cell-image.mjs'
import { ProviderError } from '../providers/provider-error.mjs'

const chunk = (items, size) => {
  const batches = []
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size))
  return batches
}

const summaryOf = (characters) => ({
  total: characters.length,
  normal: characters.filter((item) => item.category === 'normal').length,
  wrong: characters.filter((item) => item.category === 'wrong').length,
  needsCorrection: characters.filter((item) => item.category === 'needs_correction').length,
  uncertain: characters.filter((item) => item.category === 'uncertain').length,
  failed: characters.filter((item) => item.category === 'failed').length
})

export class AssessmentPipelineProvider {
  constructor({
    mediaLoader,
    qualityAnalyzer,
    segmenter,
    ocrProvider,
    decisionEngine,
    adviceProvider,
    glyphProvider = null,
    glyphVersion = 'not-rendered-synthetic-v1',
    pipelineVersion = 'synthetic-pipeline-v1'
  }) {
    this.mediaLoader = mediaLoader
    this.qualityAnalyzer = qualityAnalyzer
    this.segmenter = segmenter
    this.ocrProvider = ocrProvider
    this.decisionEngine = decisionEngine
    this.adviceProvider = adviceProvider
    this.glyphProvider = glyphProvider
    this.glyphVersion = glyphProvider?.version ?? ocrProvider.glyphVersion ?? glyphVersion
    this.scoreVersion = ocrProvider.scoreVersion ?? decisionEngine.version
    this.version = pipelineVersion
    this.name = 'deterministic-assessment-pipeline'
  }

  async assess(task, { onProgress = async () => {} } = {}) {
    await onProgress('quality_checking')
    const encodedImage = await this.mediaLoader.load(task)
    let image
    try {
      image = decodeImageRgba(encodedImage)
    } catch (error) {
      throw new ProviderError(error.message, { retryable: false })
    }
    const quality = this.qualityAnalyzer.inspect(image)
    if (!quality.accepted) throw new ProviderError(quality.reason, { retryable: false })

    await onProgress('segmenting')
    const segmentation = this.segmenter.segment(image)
    const expectedCharacters = [...task.expectedText]
    if (expectedCharacters.length > segmentation.cells.length) {
      throw new ProviderError('TARGET_TEXT_EXCEEDS_GRID', { retryable: false })
    }
    const cells = segmentation.cells.slice(0, expectedCharacters.length)
    const visualCells = createCellVisualEvidence(image, cells)

    await onProgress('recognizing')
    let ocrResults
    if (typeof this.ocrProvider.recognizePageWithCells === 'function') {
      const pagePng = encodeRgbaPng(image, {
        maximumBytes: 7 * 1024 * 1024,
        tooLargeCode: 'OCR_PAGE_IMAGE_TOO_LARGE'
      })
      ocrResults = await this.ocrProvider.recognizePageWithCells({
        page: {
          imageBase64: pagePng.toString('base64'),
          imageWidth: image.width,
          imageHeight: image.height
        },
        cells: visualCells,
        expectedCharacters
      })
    } else {
      ocrResults = []
      for (const batch of chunk(visualCells, 32)) {
        ocrResults.push(...await this.ocrProvider.recognizeCells({ cells: batch }))
      }
    }
    if (ocrResults.length !== cells.length) throw new ProviderError('OCR_CELL_COUNT_MISMATCH', { retryable: true })

    await onProgress('comparing')
    const characters = expectedCharacters.map((expectedCharacter, index) => this.decisionEngine.decide({
      expectedCharacter,
      ocrResult: ocrResults[index],
      polygon: cells[index].polygon
    }))
    const adviceTargets = characters.filter((item) => item.issueCodes.length > 0)
    const visualCellByIndex = new Map(visualCells.map((cell) => [cell.index, cell]))
    const ocrResultByIndex = new Map(ocrResults.map((item) => [item.index, item]))
    const adviceByIndex = new Map()
    if (adviceTargets.length > 0) {
      await onProgress('generating_advice')
      for (const batch of chunk(adviceTargets, 8)) {
        const baseItems = batch.map((item) => {
          const visualCell = visualCellByIndex.get(item.index)
          if (!visualCell) throw new ProviderError('CELL_VISUAL_EVIDENCE_MISSING')
          return {
            characterIndex: item.index,
            expectedCharacter: item.expectedCharacter,
            cropImageDataUrl: visualCell.cropImageDataUrl,
            ocrCandidates: item.ocrCandidates,
            issueCodes: item.issueCodes,
            features: Object.fromEntries(Object.entries({
              ...(ocrResultByIndex.get(item.index)?.deterministicFeatures ?? {}),
              totalScore: item.score,
              confidence: item.confidence,
              strokeStandard: item.scoreBreakdown.strokeStandard,
              frameStructure: item.scoreBreakdown.frameStructure,
              glyphProportion: item.scoreBreakdown.glyphProportion,
              positionLayout: item.scoreBreakdown.positionLayout
            }).filter(([, value]) => Number.isFinite(value)))
          }
        })
        let response
        try {
          const items = []
          for (const item of baseItems) {
            if (!this.adviceProvider.requiresVisualEvidence) {
              items.push(item)
              continue
            }
            if (!this.glyphProvider) throw new ProviderError('GLYPH_PROVIDER_REQUIRED')
            const glyph = await this.glyphProvider.render(item.expectedCharacter, {
              width: visualCellByIndex.get(item.characterIndex).imageWidth,
              height: visualCellByIndex.get(item.characterIndex).imageHeight
            })
            if (!glyph?.dataUrl || (glyph.version && glyph.version !== this.glyphVersion)) {
              throw new ProviderError('GLYPH_REFERENCE_INVALID')
            }
            items.push({ ...item, glyphImageDataUrl: glyph.dataUrl })
          }
          response = await this.adviceProvider.analyzeBatch({ items })
        } catch (error) {
          if (typeof this.adviceProvider.analyzeWithoutVisualEvidence !== 'function') throw error
          response = await this.adviceProvider.analyzeWithoutVisualEvidence({ items: baseItems }, error)
        }
        for (const advice of response.items) adviceByIndex.set(advice.characterIndex, advice)
      }
    }
    await onProgress('persisting_result')
    const enriched = characters.map((item) => {
      const advice = adviceByIndex.get(item.index)
      return {
        ...item,
        correctionSteps: advice?.correctionSteps ?? [],
        versions: {
          ocr: this.ocrProvider.version,
          score: this.scoreVersion,
          glyph: this.glyphVersion,
          prompt: advice ? this.adviceProvider.version ?? 'rule-template-v1' : 'not-invoked',
          model: advice ? this.adviceProvider.name : 'not-invoked'
        }
      }
    })
    const summary = summaryOf(enriched)
    const partiallyCompleted = summary.failed > 0
    const result = {
      taskId: task.taskId,
      localTaskId: task.localTaskId,
      idempotencyKey: task.idempotencyKey,
      status: partiallyCompleted ? 'partially_completed' : 'completed',
      progressStage: 'finished',
      resultVersion: task.resultVersion ?? 1,
      characters: enriched,
      summary,
      retryable: enriched.some((item) => item.needsRetry),
      errorCode: partiallyCompleted ? 'PARTIAL_CELL_FAILURE' : null
    }
    return {
      result,
      evidence: {
        pipelineVersion: this.version,
        sourceImageFormat: image.format,
        sourceOrientation: image.orientation,
        qualityVersion: quality.qualityVersion,
        qualityMetrics: quality.metrics,
        segmenterVersion: segmentation.segmenterVersion,
        segmentationMetrics: segmentation.metrics
      },
      usage: {
        provider: this.name,
        operation: 'synthetic_pixel_assessment',
        inputUnits: 1,
        outputUnits: enriched.length,
        costMicros: 0,
        pricingVersion: 'synthetic-zero-cost-v1',
        cacheHit: true
      }
    }
  }
}

export class InMemoryMediaLoader {
  constructor(entries) {
    this.entries = new Map(entries)
  }

  async load(task) {
    const image = this.entries.get(task.imageSha256)
    if (!image) throw new ProviderError('MEDIA_NOT_FOUND', { retryable: false })
    return Buffer.from(image)
  }
}
