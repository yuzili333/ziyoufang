import { ProviderError } from './provider-error.mjs'

const cellPolygon = (index, rows, columns) => {
  const row = Math.floor(index / columns)
  const column = index % columns
  const gridMargin = 0.05
  const cellWidth = (1 - gridMargin * 2) / columns
  const cellHeight = (1 - gridMargin * 2) / rows
  const insetX = cellWidth * 0.1
  const insetY = cellHeight * 0.1
  const left = gridMargin + column * cellWidth + insetX
  const right = gridMargin + (column + 1) * cellWidth - insetX
  const top = gridMargin + row * cellHeight + insetY
  const bottom = gridMargin + (row + 1) * cellHeight - insetY
  return [
    { x: left, y: top }, { x: right, y: top },
    { x: right, y: bottom }, { x: left, y: bottom }
  ]
}

export class SyntheticPageOcrProvider {
  constructor({
    renderedText,
    rows = 4,
    columns = 4,
    uncertainIndexes = [7],
    failedIndexes = [14],
    version = 'synthetic-page-ocr-v1'
  } = {}) {
    if (typeof renderedText !== 'string' || !renderedText) throw new Error('FIXTURE_RENDERED_TEXT_REQUIRED')
    this.renderedCharacters = [...renderedText]
    this.rows = rows
    this.columns = columns
    this.uncertainIndexes = new Set(uncertainIndexes)
    this.failedIndexes = new Set(failedIndexes)
    this.name = 'synthetic-page-ocr'
    this.version = version
  }

  async recognizePage(input) {
    if (!input?.imageBase64 || !Number.isFinite(input.imageWidth) || !Number.isFinite(input.imageHeight)) {
      throw new ProviderError('OCR_PAGE_INPUT_INVALID')
    }
    const words = this.renderedCharacters.flatMap((text, index) => {
      if (this.failedIndexes.has(index)) return []
      return [{
        text,
        confidence: this.uncertainIndexes.has(index) ? 0.43 : index === 3 ? 0.95 : 0.97,
        polygon: cellPolygon(index, this.rows, this.columns)
      }]
    })
    return {
      text: words.map((word) => word.text).join(''),
      lines: [{ text: words.map((word) => word.text).join(''), confidence: 0.95, words }],
      provider: this.name,
      providerVersion: this.version
    }
  }

  async recognizeCells({ cells }) {
    if (!Array.isArray(cells) || cells.length === 0 || cells.length > 32) {
      throw new ProviderError('OCR_CELL_BATCH_INVALID')
    }
    return cells.map((cell) => {
      if (this.failedIndexes.has(cell.index)) return { cellId: cell.cellId, text: '', lines: [] }
      const pageText = this.renderedCharacters[cell.index]
      const text = this.uncertainIndexes.has(cell.index) ? (pageText === '池' ? '地' : '池') : pageText
      const confidence = this.uncertainIndexes.has(cell.index) ? 0.41 : cell.index === 3 ? 0.94 : 0.96
      return {
        cellId: cell.cellId,
        text,
        lines: [{ text, confidence, words: [{ text, confidence, polygon: cellPolygon(0, 1, 1) }] }]
      }
    })
  }
}
