import { ProviderError } from '../providers/provider-error.mjs'

const NORMAL_DIMENSIONS = Object.freeze({
  strokeStandard: 93,
  frameStructure: 92,
  glyphProportion: 91,
  positionLayout: 92
})

const CORRECTION_DIMENSIONS = Object.freeze({
  strokeStandard: 68,
  frameStructure: 61,
  glyphProportion: 70,
  positionLayout: 58
})

const WRONG_DIMENSIONS = Object.freeze({
  strokeStandard: 30,
  frameStructure: 35,
  glyphProportion: 40,
  positionLayout: 45
})

export class SyntheticFixtureOcrProvider {
  constructor({
    renderedText,
    uncertainIndexes = [7],
    failedIndexes = [14],
    correctionIndexes = [0, 5, 9, 13],
    version = 'fixture-two-pass-ocr-v2'
  }) {
    if (typeof renderedText !== 'string' || !renderedText) throw new Error('FIXTURE_RENDERED_TEXT_REQUIRED')
    this.renderedCharacters = [...renderedText]
    this.uncertainIndexes = new Set(uncertainIndexes)
    this.failedIndexes = new Set(failedIndexes)
    this.correctionIndexes = new Set(correctionIndexes)
    this.version = version
    this.name = 'synthetic-fixture-ocr'
  }

  async recognizePage({ cells }) {
    const results = await this.recognizeCells({ cells })
    return {
      text: results.filter((item) => item.status === 'recognized').map((item) => item.passes[0].text).join(''),
      cells: results,
      provider: this.name,
      providerVersion: this.version
    }
  }

  async recognizeCells({ cells }) {
    if (!Array.isArray(cells) || cells.length === 0) throw new ProviderError('OCR_CELL_BATCH_INVALID')
    return cells.map((cell) => {
      const rendered = this.renderedCharacters[cell.index]
      if (!rendered || this.failedIndexes.has(cell.index)) {
        return {
          cellId: cell.cellId,
          index: cell.index,
          status: 'failed',
          passes: [],
          dimensions: null,
          deterministicIssueCodes: []
        }
      }
      if (this.uncertainIndexes.has(cell.index)) {
        return {
          cellId: cell.cellId,
          index: cell.index,
          status: 'recognized',
          passes: [
            { text: rendered, confidence: 0.43 },
            { text: rendered === '池' ? '地' : '池', confidence: 0.41 }
          ],
          dimensions: null,
          deterministicIssueCodes: []
        }
      }
      const needsCorrection = this.correctionIndexes.has(cell.index)
      const isKnownMismatch = cell.index === 3
      return {
        cellId: cell.cellId,
        index: cell.index,
        status: 'recognized',
        passes: [
          { text: rendered, confidence: isKnownMismatch ? 0.95 : 0.97 },
          { text: rendered, confidence: isKnownMismatch ? 0.94 : 0.96 }
        ],
        dimensions: isKnownMismatch
          ? { ...WRONG_DIMENSIONS }
          : needsCorrection
            ? { ...CORRECTION_DIMENSIONS }
            : { ...NORMAL_DIMENSIONS },
        deterministicIssueCodes: needsCorrection ? ['CENTER_OFFSET_LEFT'] : []
      }
    })
  }
}
