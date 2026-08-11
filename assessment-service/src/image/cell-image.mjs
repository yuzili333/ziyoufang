import { deflateSync } from 'node:zlib'

import { ProviderError } from '../providers/provider-error.mjs'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const MAXIMUM_SIDE = 1024
const MAXIMUM_PIXELS = 1_048_576
const MAXIMUM_CELL_PNG_BYTES = 2 * 1024 * 1024
const MAXIMUM_TOTAL_PNG_BYTES = 24 * 1024 * 1024

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

const crc32 = (type, data) => {
  let value = 0xffffffff
  for (const byte of Buffer.concat([type, data])) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

const pngChunk = (typeName, data) => {
  const type = Buffer.from(typeName, 'ascii')
  const output = Buffer.allocUnsafe(data.length + 12)
  output.writeUInt32BE(data.length, 0)
  type.copy(output, 4)
  data.copy(output, 8)
  output.writeUInt32BE(crc32(type, data), data.length + 8)
  return output
}

const assertImage = (image) => {
  if (!Number.isInteger(image?.width) || image.width <= 0
    || !Number.isInteger(image?.height) || image.height <= 0
    || !image.data || image.data.length !== image.width * image.height * 4) {
    throw new ProviderError('RGBA_IMAGE_INVALID')
  }
}

const resizeBilinear = (source, width, height) => {
  if (width === source.width && height === source.height) return source
  const data = Buffer.allocUnsafe(width * height * 4)
  const xRatio = source.width / width
  const yRatio = source.height / height
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.max(0, Math.min(source.height - 1, (y + 0.5) * yRatio - 0.5))
    const y0 = Math.floor(sourceY)
    const y1 = Math.min(source.height - 1, y0 + 1)
    const yWeight = sourceY - y0
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.max(0, Math.min(source.width - 1, (x + 0.5) * xRatio - 0.5))
      const x0 = Math.floor(sourceX)
      const x1 = Math.min(source.width - 1, x0 + 1)
      const xWeight = sourceX - x0
      const outputOffset = (y * width + x) * 4
      const offsets = [
        (y0 * source.width + x0) * 4,
        (y0 * source.width + x1) * 4,
        (y1 * source.width + x0) * 4,
        (y1 * source.width + x1) * 4
      ]
      for (let channel = 0; channel < 4; channel += 1) {
        const top = source.data[offsets[0] + channel] * (1 - xWeight)
          + source.data[offsets[1] + channel] * xWeight
        const bottom = source.data[offsets[2] + channel] * (1 - xWeight)
          + source.data[offsets[3] + channel] * xWeight
        data[outputOffset + channel] = Math.round(top * (1 - yWeight) + bottom * yWeight)
      }
    }
  }
  return { width, height, data, channels: 4 }
}

export function cropCellRgba(image, pixelBounds, {
  insetRatio = 0.02,
  maximumSide = MAXIMUM_SIDE,
  maximumPixels = MAXIMUM_PIXELS
} = {}) {
  assertImage(image)
  const values = ['left', 'top', 'right', 'bottom'].map((key) => Number(pixelBounds?.[key]))
  if (!values.every(Number.isFinite)) throw new ProviderError('CELL_BOUNDS_INVALID')
  let [left, top, right, bottom] = values
  if (left < 0 || top < 0 || right > image.width || bottom > image.height || right <= left || bottom <= top) {
    throw new ProviderError('CELL_BOUNDS_INVALID')
  }
  if (!Number.isFinite(insetRatio) || insetRatio < 0 || insetRatio >= 0.2) {
    throw new ProviderError('CELL_INSET_INVALID')
  }
  const insetX = (right - left) * insetRatio
  const insetY = (bottom - top) * insetRatio
  left = Math.ceil(left + insetX)
  top = Math.ceil(top + insetY)
  right = Math.floor(right - insetX)
  bottom = Math.floor(bottom - insetY)
  const cropWidth = right - left
  const cropHeight = bottom - top
  if (cropWidth <= 0 || cropHeight <= 0) throw new ProviderError('CELL_CROP_EMPTY')
  const data = Buffer.allocUnsafe(cropWidth * cropHeight * 4)
  for (let row = 0; row < cropHeight; row += 1) {
    const sourceOffset = ((top + row) * image.width + left) * 4
    image.data.copy(data, row * cropWidth * 4, sourceOffset, sourceOffset + cropWidth * 4)
  }
  const scale = Math.min(
    1,
    maximumSide / cropWidth,
    maximumSide / cropHeight,
    Math.sqrt(maximumPixels / (cropWidth * cropHeight))
  )
  const width = Math.max(1, Math.floor(cropWidth * scale))
  const height = Math.max(1, Math.floor(cropHeight * scale))
  return resizeBilinear({ width: cropWidth, height: cropHeight, data, channels: 4 }, width, height)
}

export function encodeRgbaPng(image, {
  maximumBytes = MAXIMUM_CELL_PNG_BYTES,
  tooLargeCode = 'CELL_IMAGE_TOO_LARGE'
} = {}) {
  assertImage(image)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0
  const rowBytes = image.width * 4
  const scanlines = Buffer.allocUnsafe(image.height * (rowBytes + 1))
  for (let row = 0; row < image.height; row += 1) {
    const outputOffset = row * (rowBytes + 1)
    scanlines[outputOffset] = 0
    image.data.copy(scanlines, outputOffset + 1, row * rowBytes, (row + 1) * rowBytes)
  }
  const encoded = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 6 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
  if (encoded.length > maximumBytes) throw new ProviderError(tooLargeCode)
  return encoded
}

export function createCellVisualEvidence(image, cells) {
  if (!Array.isArray(cells) || cells.length === 0 || cells.length > 64) {
    throw new ProviderError('CELL_VISUAL_BATCH_INVALID')
  }
  const evidence = []
  let totalBytes = 0
  for (const cell of cells) {
    const crop = cropCellRgba(image, cell.pixelBounds)
    const png = encodeRgbaPng(crop)
    totalBytes += png.length
    if (totalBytes > MAXIMUM_TOTAL_PNG_BYTES) throw new ProviderError('CELL_VISUAL_TOTAL_TOO_LARGE')
    const imageBase64 = png.toString('base64')
    evidence.push({
      ...cell,
      imageBase64,
      imageWidth: crop.width,
      imageHeight: crop.height,
      cropImageDataUrl: `data:image/png;base64,${imageBase64}`
    })
  }
  return evidence
}

export const cellImageLimits = Object.freeze({
  maximumSide: MAXIMUM_SIDE,
  maximumPixels: MAXIMUM_PIXELS,
  maximumCellPngBytes: MAXIMUM_CELL_PNG_BYTES,
  maximumTotalPngBytes: MAXIMUM_TOTAL_PNG_BYTES
})
