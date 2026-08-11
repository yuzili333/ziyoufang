import { ProviderError } from './provider-error.mjs'

const chunk = (items, size) => {
  const batches = []
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size))
  return batches
}

const singleCharacter = (value) => {
  if (typeof value !== 'string') return null
  const characters = [...value.trim()]
  return characters.length === 1 ? characters[0] : null
}

const polygonBounds = (polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 4) return null
  const xs = polygon.map((point) => Number(point?.x))
  const ys = polygon.map((point) => Number(point?.y))
  if (![...xs, ...ys].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return null
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
}

const centroid = (polygon) => {
  if (!Array.isArray(polygon) || polygon.length === 0) return null
  const points = polygon.map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  }
}

const contains = (bounds, point) => bounds && point
  && point.x >= bounds.left && point.x <= bounds.right
  && point.y >= bounds.top && point.y <= bounds.bottom

const pageWords = (result) => (result?.lines ?? []).flatMap((line) => (line.words ?? []).map((word) => ({
  text: singleCharacter(word.text),
  confidence: Number(word.confidence),
  polygon: word.polygon
}))).filter((word) => word.text && Number.isFinite(word.confidence)
  && word.confidence >= 0 && word.confidence <= 1 && centroid(word.polygon))

const bestCellCandidate = (result) => {
  const words = pageWords(result).sort((left, right) => right.confidence - left.confidence)
  if (words.length > 0) return { text: words[0].text, confidence: words[0].confidence }
  const text = singleCharacter(result?.text)
  const confidence = Number(result?.lines?.[0]?.confidence)
  return text && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
    ? { text, confidence }
    : null
}

const pageCandidatesByCell = (result, cells) => {
  const candidates = new Map(cells.map((cell) => [cell.cellId, []]))
  for (const word of pageWords(result)) {
    const center = centroid(word.polygon)
    const matches = cells.filter((cell) => contains(polygonBounds(cell.polygon), center))
    if (matches.length !== 1) continue
    candidates.get(matches[0].cellId).push({ text: word.text, confidence: word.confidence })
  }
  return new Map([...candidates].map(([cellId, values]) => {
    const sorted = values.sort((left, right) => right.confidence - left.confidence)
    return [cellId, {
      candidate: sorted[0] ?? null,
      candidates: sorted,
      conflict: new Set(sorted.map((item) => item.text)).size > 1
    }]
  }))
}

export class PageFirstOcrEvidenceProvider {
  constructor({
    rawProvider,
    featureProvider,
    highConfidenceThreshold = 0.9,
    retryBatchSize = 32
  } = {}) {
    if (!rawProvider?.recognizePage || !rawProvider?.recognizeCells) {
      throw new Error('RAW_OCR_PROVIDER_REQUIRED')
    }
    if (!featureProvider?.analyzeCell) throw new Error('OCR_FEATURE_PROVIDER_REQUIRED')
    if (!Number.isFinite(highConfidenceThreshold) || highConfidenceThreshold <= 0 || highConfidenceThreshold > 1) {
      throw new Error('OCR_HIGH_CONFIDENCE_THRESHOLD_INVALID')
    }
    if (!Number.isInteger(retryBatchSize) || retryBatchSize <= 0 || retryBatchSize > 32) {
      throw new Error('OCR_RETRY_BATCH_SIZE_INVALID')
    }
    this.rawProvider = rawProvider
    this.featureProvider = featureProvider
    this.highConfidenceThreshold = highConfidenceThreshold
    this.retryBatchSize = retryBatchSize
    this.name = `${rawProvider.name ?? 'raw-ocr'}-page-first-evidence`
    this.version = `${rawProvider.version ?? 'raw-ocr-unversioned'}+${featureProvider.version ?? 'feature-unversioned'}`
    this.scoreVersion = featureProvider.version ?? null
    this.glyphVersion = featureProvider.glyphProvider?.version ?? null
  }

  async recognizePageWithCells({ page, cells, expectedCharacters }) {
    if (!page?.imageBase64 || !Number.isFinite(page.imageWidth) || !Number.isFinite(page.imageHeight)) {
      throw new ProviderError('OCR_PAGE_INPUT_INVALID')
    }
    if (!Array.isArray(cells) || cells.length === 0 || cells.length > 64
      || !Array.isArray(expectedCharacters) || expectedCharacters.length !== cells.length) {
      throw new ProviderError('OCR_PAGE_CELL_INPUT_INVALID')
    }
    const pageResult = await this.rawProvider.recognizePage(page)
    const firstByCell = pageCandidatesByCell(pageResult, cells)
    const retryCells = cells.filter((cell, index) => {
      const first = firstByCell.get(cell.cellId)
      return !first?.candidate || first.conflict
        || first.candidate.confidence < this.highConfidenceThreshold
        || first.candidate.text !== expectedCharacters[index]
    })
    const retryByCell = new Map()
    for (const batch of chunk(retryCells, this.retryBatchSize)) {
      const results = await this.rawProvider.recognizeCells({ cells: batch })
      if (!Array.isArray(results) || results.length !== batch.length) {
        throw new ProviderError('OCR_CELL_COUNT_MISMATCH', { retryable: true })
      }
      const expectedIds = new Set(batch.map((cell) => cell.cellId))
      if (new Set(results.map((result) => result?.cellId)).size !== results.length
        || results.some((result) => !expectedIds.has(result?.cellId))) {
        throw new ProviderError('OCR_CELL_ID_MISMATCH', { retryable: true })
      }
      for (const result of results) retryByCell.set(result.cellId, bestCellCandidate(result))
    }

    const evidence = []
    for (const [index, cell] of cells.entries()) {
      const first = firstByCell.get(cell.cellId)
      const passes = []
      if (first?.candidate) passes.push(...(first.conflict ? first.candidates.slice(0, 2) : [first.candidate]))
      const retry = retryByCell.get(cell.cellId)
      if (retry) passes.push(retry)
      if (passes.length === 0) {
        evidence.push({
          cellId: cell.cellId,
          index: cell.index,
          status: 'failed',
          passes: [],
          dimensions: null,
          deterministicIssueCodes: []
        })
        continue
      }
      try {
        const features = await this.featureProvider.analyzeCell({
          cell,
          expectedCharacter: expectedCharacters[index],
          ocrCandidates: passes
        })
        evidence.push({
          cellId: cell.cellId,
          index: cell.index,
          status: 'recognized',
          passes,
          dimensions: features.dimensions,
          deterministicIssueCodes: features.issueCodes ?? [],
          deterministicFeatures: features.features ?? {},
          featureVersion: features.featureVersion ?? this.scoreVersion,
          glyphVersion: features.glyphVersion ?? this.glyphVersion
        })
      } catch {
        evidence.push({
          cellId: cell.cellId,
          index: cell.index,
          status: 'failed',
          passes,
          dimensions: null,
          deterministicIssueCodes: []
        })
      }
    }
    return evidence
  }
}
