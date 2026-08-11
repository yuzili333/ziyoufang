import jpeg from 'jpeg-js'

import { decodePngRgba } from './png-rgba.mjs'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])
const MAXIMUM_ENCODED_BYTES = 15 * 1024 * 1024
const MAXIMUM_PIXELS = 20_000_000

export function detectImageFormat(input) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (source.length >= PNG_SIGNATURE.length && source.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  if (source.length >= JPEG_SIGNATURE.length && source.subarray(0, 3).equals(JPEG_SIGNATURE)) return 'jpeg'
  return null
}

const readExifOrientation = (source) => {
  let offset = 2
  while (offset + 4 <= source.length) {
    while (source[offset] === 0xff) offset += 1
    const marker = source[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) return 1
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > source.length) return 1
    const segmentLength = source.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > source.length) return 1
    const payloadStart = offset + 2
    const payloadEnd = offset + segmentLength
    if (marker === 0xe1
      && payloadEnd - payloadStart >= 14
      && source.subarray(payloadStart, payloadStart + 6).equals(Buffer.from('Exif\0\0'))) {
      const tiffStart = payloadStart + 6
      const byteOrder = source.toString('ascii', tiffStart, tiffStart + 2)
      const littleEndian = byteOrder === 'II'
      if (!littleEndian && byteOrder !== 'MM') return 1
      const read16 = (position) => littleEndian ? source.readUInt16LE(position) : source.readUInt16BE(position)
      const read32 = (position) => littleEndian ? source.readUInt32LE(position) : source.readUInt32BE(position)
      if (tiffStart + 8 > payloadEnd || read16(tiffStart + 2) !== 42) return 1
      const ifdOffset = read32(tiffStart + 4)
      const ifdStart = tiffStart + ifdOffset
      if (ifdStart + 2 > payloadEnd) return 1
      const entryCount = read16(ifdStart)
      for (let index = 0; index < entryCount; index += 1) {
        const entry = ifdStart + 2 + index * 12
        if (entry + 12 > payloadEnd) return 1
        if (read16(entry) !== 0x0112) continue
        if (read16(entry + 2) !== 3 || read32(entry + 4) < 1) return 1
        const orientation = read16(entry + 8)
        return orientation >= 1 && orientation <= 8 ? orientation : 1
      }
    }
    offset += segmentLength
  }
  return 1
}

const orientRgba = (image, orientation) => {
  if (orientation === 1) return image
  const swapsAxes = orientation >= 5
  const width = swapsAxes ? image.height : image.width
  const height = swapsAxes ? image.width : image.height
  const data = Buffer.allocUnsafe(width * height * 4)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      let outputX
      let outputY
      if (orientation === 2) [outputX, outputY] = [image.width - 1 - x, y]
      else if (orientation === 3) [outputX, outputY] = [image.width - 1 - x, image.height - 1 - y]
      else if (orientation === 4) [outputX, outputY] = [x, image.height - 1 - y]
      else if (orientation === 5) [outputX, outputY] = [y, x]
      else if (orientation === 6) [outputX, outputY] = [image.height - 1 - y, x]
      else if (orientation === 7) [outputX, outputY] = [image.height - 1 - y, image.width - 1 - x]
      else [outputX, outputY] = [y, image.width - 1 - x]
      const inputOffset = (y * image.width + x) * 4
      const outputOffset = (outputY * width + outputX) * 4
      data[outputOffset] = image.data[inputOffset]
      data[outputOffset + 1] = image.data[inputOffset + 1]
      data[outputOffset + 2] = image.data[inputOffset + 2]
      data[outputOffset + 3] = image.data[inputOffset + 3]
    }
  }
  return { width, height, data, channels: 4 }
}

export function decodeImageRgba(input) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (source.length === 0) throw new Error('IMAGE_INPUT_EMPTY')
  if (source.length > MAXIMUM_ENCODED_BYTES) throw new Error('IMAGE_FILE_TOO_LARGE')
  const format = detectImageFormat(source)
  if (!format) throw new Error('IMAGE_FORMAT_UNSUPPORTED')
  try {
    if (format === 'png') return { ...decodePngRgba(source), format, orientation: 1 }
    const orientation = readExifOrientation(source)
    const decoded = jpeg.decode(source, {
      useTArray: true,
      formatAsRGBA: true,
      tolerantDecoding: false,
      maxResolutionInMP: MAXIMUM_PIXELS / 1_000_000,
      maxMemoryUsageInMB: 256
    })
    if (!decoded?.width || !decoded?.height || decoded.width * decoded.height > MAXIMUM_PIXELS) {
      throw new Error('IMAGE_PIXEL_LIMIT_EXCEEDED')
    }
    const oriented = orientRgba({
      width: decoded.width,
      height: decoded.height,
      data: Buffer.from(decoded.data),
      channels: 4
    }, orientation)
    return { ...oriented, format, orientation }
  } catch (error) {
    if (String(error?.message).includes('PIXEL_LIMIT_EXCEEDED')
      || String(error?.message).includes('maxResolutionInMP')) {
      throw new Error('IMAGE_PIXEL_LIMIT_EXCEEDED')
    }
    throw new Error('IMAGE_DECODE_FAILED')
  }
}

export const imageLimits = Object.freeze({
  maximumEncodedBytes: MAXIMUM_ENCODED_BYTES,
  maximumPixels: MAXIMUM_PIXELS
})
