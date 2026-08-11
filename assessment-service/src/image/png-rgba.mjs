import { inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const MAXIMUM_PIXELS = 20_000_000

const paeth = (left, above, upperLeft) => {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

export function decodePngRgba(input) {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (source.length < 33 || !source.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG_SIGNATURE_INVALID')
  let offset = 8
  let width
  let height
  let bitDepth
  let colorType
  let interlace
  const compressed = []
  let ended = false
  while (offset + 12 <= source.length) {
    const length = source.readUInt32BE(offset)
    const type = source.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > source.length) throw new Error('PNG_CHUNK_TRUNCATED')
    const data = source.subarray(dataStart, dataEnd)
    if (type === 'IHDR') {
      if (length !== 13 || width !== undefined) throw new Error('PNG_IHDR_INVALID')
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (data[10] !== 0 || data[11] !== 0) throw new Error('PNG_COMPRESSION_UNSUPPORTED')
      interlace = data[12]
    } else if (type === 'IDAT') {
      compressed.push(data)
    } else if (type === 'IEND') {
      ended = true
      break
    }
    offset = dataEnd + 4
  }
  if (!ended || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('PNG_STRUCTURE_INVALID')
  }
  if (width * height > MAXIMUM_PIXELS) throw new Error('PNG_PIXEL_LIMIT_EXCEEDED')
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error('PNG_FORMAT_UNSUPPORTED')
  const bytesPerPixel = 4
  const rowBytes = width * bytesPerPixel
  const expectedInflatedBytes = height * (rowBytes + 1)
  const inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedInflatedBytes })
  if (inflated.length !== expectedInflatedBytes) throw new Error('PNG_SCANLINE_SIZE_INVALID')
  const pixels = Buffer.allocUnsafe(width * height * bytesPerPixel)
  let inputOffset = 0
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[inputOffset]
    inputOffset += 1
    const outputOffset = row * rowBytes
    for (let columnByte = 0; columnByte < rowBytes; columnByte += 1) {
      const raw = inflated[inputOffset + columnByte]
      const left = columnByte >= bytesPerPixel ? pixels[outputOffset + columnByte - bytesPerPixel] : 0
      const above = row > 0 ? pixels[outputOffset + columnByte - rowBytes] : 0
      const upperLeft = row > 0 && columnByte >= bytesPerPixel
        ? pixels[outputOffset + columnByte - rowBytes - bytesPerPixel]
        : 0
      let value
      if (filter === 0) value = raw
      else if (filter === 1) value = raw + left
      else if (filter === 2) value = raw + above
      else if (filter === 3) value = raw + Math.floor((left + above) / 2)
      else if (filter === 4) value = raw + paeth(left, above, upperLeft)
      else throw new Error('PNG_FILTER_UNSUPPORTED')
      pixels[outputOffset + columnByte] = value & 0xff
    }
    inputOffset += rowBytes
  }
  return { width, height, data: pixels, channels: 4 }
}

export const rgbaLuminance = (data, offset) => Math.round(
  data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722
)
