import { decodeImageRgba } from './image-rgba.mjs'
import { ProviderError } from '../providers/provider-error.mjs'

const DATA_URL = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/
const MAXIMUM_REFERENCE_BYTES = 4 * 1024 * 1024
const NORMALIZED_SIZE = 64

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const score = (value) => Math.round(clamp01(value) * 100)
const rounded = (value) => Math.round(value * 10_000) / 10_000

const decodeBase64Image = (value, code) => {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAXIMUM_REFERENCE_BYTES * 1.4) {
    throw new ProviderError(code)
  }
  const match = value.match(DATA_URL)
  const base64 = match?.[2] ?? (code === 'CELL_IMAGE_INVALID' ? value : null)
  if (!base64) throw new ProviderError(code)
  let encoded
  try {
    encoded = Buffer.from(base64, 'base64')
  } catch {
    throw new ProviderError(code)
  }
  if (encoded.length === 0 || encoded.length > MAXIMUM_REFERENCE_BYTES) throw new ProviderError(code)
  try {
    return decodeImageRgba(encoded)
  } catch {
    throw new ProviderError(code)
  }
}

const inkMask = (image, threshold = 190) => {
  const mask = new Uint8Array(image.width * image.height)
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4
    const alpha = image.data[offset + 3] / 255
    const red = image.data[offset] * alpha + 255 * (1 - alpha)
    const green = image.data[offset + 1] * alpha + 255 * (1 - alpha)
    const blue = image.data[offset + 2] * alpha + 255 * (1 - alpha)
    const redGrid = red > green + 30 && red > blue + 30 && red > 120
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    mask[index] = !redGrid && luminance < threshold ? 1 : 0
  }
  return mask
}

const maskMetrics = (mask, width, height) => {
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  let inkCount = 0
  let xSum = 0
  let ySum = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      inkCount += 1
      xSum += x + 0.5
      ySum += y + 0.5
    }
  }
  if (inkCount === 0) throw new ProviderError('GLYPH_INK_EMPTY')
  const boxWidth = right - left + 1
  const boxHeight = bottom - top + 1
  return {
    left, right, top, bottom, inkCount,
    centerX: xSum / inkCount / width,
    centerY: ySum / inkCount / height,
    inkRatio: inkCount / (width * height),
    boxWidthRatio: boxWidth / width,
    boxHeightRatio: boxHeight / height,
    boxAreaRatio: boxWidth * boxHeight / (width * height),
    aspectRatio: boxWidth / boxHeight
  }
}

const normalizedMask = (mask, width, height, metrics, size = NORMALIZED_SIZE) => {
  const output = new Uint8Array(size * size)
  const sourceWidth = metrics.right - metrics.left + 1
  const sourceHeight = metrics.bottom - metrics.top + 1
  const inner = Math.floor(size * 0.84)
  const scale = Math.min(inner / sourceWidth, inner / sourceHeight)
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale))
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale))
  const offsetX = Math.floor((size - outputWidth) / 2)
  const offsetY = Math.floor((size - outputHeight) / 2)
  for (let y = 0; y < outputHeight; y += 1) {
    const sourceY = Math.min(metrics.bottom, metrics.top + Math.floor((y + 0.5) * sourceHeight / outputHeight))
    for (let x = 0; x < outputWidth; x += 1) {
      const sourceX = Math.min(metrics.right, metrics.left + Math.floor((x + 0.5) * sourceWidth / outputWidth))
      output[(offsetY + y) * size + offsetX + x] = mask[sourceY * width + sourceX]
    }
  }
  return output
}

const distributionSimilarity = (left, right) => {
  const leftTotal = left.reduce((sum, value) => sum + value, 0)
  const rightTotal = right.reduce((sum, value) => sum + value, 0)
  if (leftTotal === 0 || rightTotal === 0) return 0
  let distance = 0
  for (let index = 0; index < left.length; index += 1) {
    distance += Math.abs(left[index] / leftTotal - right[index] / rightTotal)
  }
  return clamp01(1 - distance / 2)
}

const quadrantDistribution = (mask, size) => {
  const values = [0, 0, 0, 0]
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!mask[y * size + x]) continue
      values[(y >= size / 2 ? 2 : 0) + (x >= size / 2 ? 1 : 0)] += 1
    }
  }
  return values
}

const projections = (mask, size) => {
  const horizontal = new Array(size).fill(0)
  const vertical = new Array(size).fill(0)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!mask[y * size + x]) continue
      horizontal[y] += 1
      vertical[x] += 1
    }
  }
  return { horizontal, vertical }
}

const intersectionOverUnion = (left, right) => {
  let intersection = 0
  let union = 0
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] || right[index]) union += 1
    if (left[index] && right[index]) intersection += 1
  }
  return union ? intersection / union : 0
}

const thin = (input, size) => {
  const mask = Uint8Array.from(input)
  const neighbors = (index) => {
    const north = index - size
    const south = index + size
    return [
      mask[north], mask[north + 1], mask[index + 1], mask[south + 1],
      mask[south], mask[south - 1], mask[index - 1], mask[north - 1]
    ]
  }
  for (let iteration = 0; iteration < size * 2; iteration += 1) {
    let changed = false
    for (let phase = 0; phase < 2; phase += 1) {
      const remove = []
      for (let y = 1; y < size - 1; y += 1) {
        for (let x = 1; x < size - 1; x += 1) {
          const index = y * size + x
          if (!mask[index]) continue
          const points = neighbors(index)
          const count = points.reduce((sum, value) => sum + value, 0)
          if (count < 2 || count > 6) continue
          let transitions = 0
          for (let point = 0; point < 8; point += 1) {
            if (!points[point] && points[(point + 1) % 8]) transitions += 1
          }
          if (transitions !== 1) continue
          const [north, , east, , south, , west] = points
          const firstConstraint = phase === 0 ? north * east * south : north * east * west
          const secondConstraint = phase === 0 ? east * south * west : north * south * west
          if (firstConstraint === 0 && secondConstraint === 0) remove.push(index)
        }
      }
      if (remove.length) changed = true
      for (const index of remove) mask[index] = 0
    }
    if (!changed) break
  }
  return mask
}

const skeletonF1 = (left, right) => {
  let leftCount = 0
  let rightCount = 0
  let intersection = 0
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]) leftCount += 1
    if (right[index]) rightCount += 1
    if (left[index] && right[index]) intersection += 1
  }
  return leftCount + rightCount ? 2 * intersection / (leftCount + rightCount) : 0
}

const componentCount = (mask, size) => {
  const seen = new Uint8Array(mask.length)
  let count = 0
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue
    count += 1
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const index = stack.pop()
      const x = index % size
      const y = Math.floor(index / size)
      for (const neighbor of [index - 1, index + 1, index - size, index + size]) {
        const neighborX = neighbor % size
        const neighborY = Math.floor(neighbor / size)
        if (neighbor < 0 || neighbor >= mask.length || seen[neighbor] || !mask[neighbor]) continue
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) continue
        seen[neighbor] = 1
        stack.push(neighbor)
      }
    }
  }
  return count
}

const relativeSimilarity = (left, right, tolerance = 1) => clamp01(
  1 - Math.abs(left - right) / Math.max(Math.abs(right) * tolerance, 0.05)
)

export class PixelGlyphFeatureProvider {
  constructor({
    glyphProvider,
    version = 'pixel-glyph-features-v1',
    issueThreshold = 75,
    centerOffsetThreshold = 0.06,
    sizeRatioThreshold = 0.25
  } = {}) {
    if (!glyphProvider?.render || !glyphProvider.version) throw new Error('GLYPH_PROVIDER_REQUIRED')
    this.glyphProvider = glyphProvider
    this.version = `${version}+${glyphProvider.version}`
    this.issueThreshold = issueThreshold
    this.centerOffsetThreshold = centerOffsetThreshold
    this.sizeRatioThreshold = sizeRatioThreshold
  }

  async analyzeCell({ cell, expectedCharacter }) {
    if (typeof expectedCharacter !== 'string' || [...expectedCharacter].length !== 1) {
      throw new ProviderError('EXPECTED_CHARACTER_INVALID')
    }
    const handwriting = decodeBase64Image(cell?.imageBase64, 'CELL_IMAGE_INVALID')
    const reference = await this.glyphProvider.render(expectedCharacter, {
      width: handwriting.width,
      height: handwriting.height
    })
    if (!reference?.dataUrl || reference.version !== this.glyphProvider.version) {
      throw new ProviderError('GLYPH_REFERENCE_INVALID')
    }
    const glyph = decodeBase64Image(reference.dataUrl, 'GLYPH_REFERENCE_INVALID')
    const handwritingMask = inkMask(handwriting)
    const glyphMask = inkMask(glyph)
    const handwritingMetrics = maskMetrics(handwritingMask, handwriting.width, handwriting.height)
    const glyphMetrics = maskMetrics(glyphMask, glyph.width, glyph.height)
    const normalizedHandwriting = normalizedMask(
      handwritingMask, handwriting.width, handwriting.height, handwritingMetrics
    )
    const normalizedGlyph = normalizedMask(glyphMask, glyph.width, glyph.height, glyphMetrics)
    const iou = intersectionOverUnion(normalizedHandwriting, normalizedGlyph)
    const skeleton = skeletonF1(
      thin(normalizedHandwriting, NORMALIZED_SIZE),
      thin(normalizedGlyph, NORMALIZED_SIZE)
    )
    const quadrant = distributionSimilarity(
      quadrantDistribution(normalizedHandwriting, NORMALIZED_SIZE),
      quadrantDistribution(normalizedGlyph, NORMALIZED_SIZE)
    )
    const handwritingProjection = projections(normalizedHandwriting, NORMALIZED_SIZE)
    const glyphProjection = projections(normalizedGlyph, NORMALIZED_SIZE)
    const projection = (
      distributionSimilarity(handwritingProjection.horizontal, glyphProjection.horizontal)
      + distributionSimilarity(handwritingProjection.vertical, glyphProjection.vertical)
    ) / 2
    const handwritingComponents = componentCount(normalizedHandwriting, NORMALIZED_SIZE)
    const glyphComponents = componentCount(normalizedGlyph, NORMALIZED_SIZE)
    const componentSimilarity = 1 - Math.abs(handwritingComponents - glyphComponents)
      / Math.max(handwritingComponents, glyphComponents, 1)
    const inkSimilarity = relativeSimilarity(handwritingMetrics.inkRatio, glyphMetrics.inkRatio, 1.5)
    const aspectSimilarity = relativeSimilarity(handwritingMetrics.aspectRatio, glyphMetrics.aspectRatio, 0.8)
    const widthSimilarity = relativeSimilarity(handwritingMetrics.boxWidthRatio, glyphMetrics.boxWidthRatio, 0.8)
    const heightSimilarity = relativeSimilarity(handwritingMetrics.boxHeightRatio, glyphMetrics.boxHeightRatio, 0.8)
    const centerOffsetX = handwritingMetrics.centerX - glyphMetrics.centerX
    const centerOffsetY = handwritingMetrics.centerY - glyphMetrics.centerY
    const centerSimilarity = clamp01(1 - Math.hypot(centerOffsetX, centerOffsetY) / 0.22)

    const dimensions = {
      strokeStandard: score(skeleton * 0.55 + iou * 0.3 + inkSimilarity * 0.15),
      frameStructure: score(quadrant * 0.4 + projection * 0.35 + componentSimilarity * 0.25),
      glyphProportion: score(aspectSimilarity * 0.5 + widthSimilarity * 0.25 + heightSimilarity * 0.25),
      positionLayout: score(centerSimilarity)
    }
    const issueCodes = []
    if (centerOffsetX < -this.centerOffsetThreshold) issueCodes.push('CENTER_OFFSET_LEFT')
    if (centerOffsetX > this.centerOffsetThreshold) issueCodes.push('CENTER_OFFSET_RIGHT')
    if (centerOffsetY < -this.centerOffsetThreshold) issueCodes.push('CENTER_OFFSET_UP')
    if (centerOffsetY > this.centerOffsetThreshold) issueCodes.push('CENTER_OFFSET_DOWN')
    const areaRatio = handwritingMetrics.boxAreaRatio / glyphMetrics.boxAreaRatio
    if (areaRatio > 1 + this.sizeRatioThreshold) issueCodes.push('GLYPH_TOO_LARGE')
    if (areaRatio < 1 - this.sizeRatioThreshold) issueCodes.push('GLYPH_TOO_SMALL')
    if (dimensions.strokeStandard < this.issueThreshold) issueCodes.push('STROKE_FORM_DIFFERENT')
    if (dimensions.frameStructure < this.issueThreshold) issueCodes.push('FRAME_STRUCTURE_DIFFERENT')
    if (dimensions.glyphProportion < this.issueThreshold) issueCodes.push('GLYPH_PROPORTION_IMBALANCED')

    return {
      dimensions,
      issueCodes: [...new Set(issueCodes)],
      features: {
        centerOffsetX: rounded(centerOffsetX),
        centerOffsetY: rounded(centerOffsetY),
        inkRatio: rounded(handwritingMetrics.inkRatio),
        glyphInkRatio: rounded(glyphMetrics.inkRatio),
        bboxAspectRatio: rounded(handwritingMetrics.aspectRatio),
        glyphAspectRatio: rounded(glyphMetrics.aspectRatio),
        maskIoU: rounded(iou),
        skeletonF1: rounded(skeleton),
        quadrantSimilarity: rounded(quadrant),
        projectionSimilarity: rounded(projection),
        componentSimilarity: rounded(componentSimilarity)
      },
      featureVersion: this.version,
      glyphVersion: this.glyphProvider.version
    }
  }
}
