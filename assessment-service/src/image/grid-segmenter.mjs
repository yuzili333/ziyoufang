import { ProviderError } from '../providers/provider-error.mjs'

const isGridPixel = (data, offset) => {
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  return red > 120 && red > green + 10 && red > blue + 10
}

const projection = (image, axis, sampleStep) => {
  const length = axis === 'x' ? image.width : image.height
  const otherLength = axis === 'x' ? image.height : image.width
  const values = new Float64Array(length)
  for (let position = 0; position < length; position += 1) {
    let matches = 0
    let samples = 0
    for (let other = 0; other < otherLength; other += sampleStep) {
      const x = axis === 'x' ? position : other
      const y = axis === 'x' ? other : position
      if (isGridPixel(image.data, (y * image.width + x) * 4)) matches += 1
      samples += 1
    }
    values[position] = matches / samples
  }
  return values
}

const groupedPeakCenters = (values, threshold) => {
  const centers = []
  let start = null
  for (let index = 0; index <= values.length; index += 1) {
    if (index < values.length && values[index] >= threshold) {
      if (start === null) start = index
      continue
    }
    if (start !== null) {
      let weightedPosition = 0
      let totalWeight = 0
      for (let point = start; point < index; point += 1) {
        weightedPosition += point * values[point]
        totalWeight += values[point]
      }
      centers.push(Math.round(weightedPosition / totalWeight))
      start = null
    }
  }
  return centers
}

const point = (x, y, width, height) => ({ x: x / width, y: y / height })

export class DeterministicGridSegmenter {
  constructor({
    version = 'red-grid-projection-synthetic-v1',
    rows = 4,
    columns = 4,
    lineProjectionThreshold = 0.7,
    sampleStep = 4
  } = {}) {
    this.version = version
    this.rows = rows
    this.columns = columns
    this.lineProjectionThreshold = lineProjectionThreshold
    this.sampleStep = sampleStep
  }

  segment(image) {
    const verticalLines = groupedPeakCenters(projection(image, 'x', this.sampleStep), this.lineProjectionThreshold)
    const horizontalLines = groupedPeakCenters(projection(image, 'y', this.sampleStep), this.lineProjectionThreshold)
    if (verticalLines.length !== this.columns + 1 || horizontalLines.length !== this.rows + 1) {
      throw new ProviderError('GRID_SEGMENTATION_FAILED', { retryable: false })
    }
    const cells = []
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const left = verticalLines[column]
        const right = verticalLines[column + 1]
        const top = horizontalLines[row]
        const bottom = horizontalLines[row + 1]
        cells.push({
          cellId: `r${row}c${column}`,
          index: row * this.columns + column,
          row,
          column,
          pixelBounds: { left, top, right, bottom },
          polygon: [
            point(left, top, image.width, image.height),
            point(right, top, image.width, image.height),
            point(right, bottom, image.width, image.height),
            point(left, bottom, image.width, image.height)
          ]
        })
      }
    }
    return {
      cells,
      verticalLines,
      horizontalLines,
      segmenterVersion: this.version,
      metrics: { detectedRows: this.rows, detectedColumns: this.columns, cellCount: cells.length }
    }
  }
}
