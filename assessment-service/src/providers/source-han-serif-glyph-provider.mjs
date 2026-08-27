import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { createCanvas, GlobalFonts } from '@napi-rs/canvas'

import { ProviderError } from './provider-error.mjs'

export const SOURCE_HAN_SERIF_SC_RELEASE = '2.003R'
export const SOURCE_HAN_SERIF_SC_FONT_SHA256 = '78aa7a328fd974df2d688c8a9fd74a33d8334dfa84ab24d9d11efb2ffc464117'
export const SOURCE_HAN_SERIF_SC_LICENSE_SHA256 = '9ff5bb567e1b92c801fc1069e5fbf992ff8efccacb9db94e5959a5b3ba9bb903'
export const SOURCE_HAN_SERIF_RENDERER_VERSION = 'renderer-v1'

const defaultAssetRoot = new URL('../../assets/fonts/source-han-serif-sc-2.003R/', import.meta.url)
const defaultFontPath = fileURLToPath(new URL('SourceHanSerifSC-Regular.otf', defaultAssetRoot))
const defaultLicensePath = fileURLToPath(new URL('LICENSE.txt', defaultAssetRoot))
const registeredFonts = new Map()

const sha256File = (path) => new Promise((resolve, reject) => {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  stream.on('data', (chunk) => hash.update(chunk))
  stream.on('error', reject)
  stream.on('end', () => resolve(hash.digest('hex')))
})

const verifyFile = async ({ path, expectedHash, missingCode, mismatchCode }) => {
  try {
    await access(path)
    const actualHash = await sha256File(path)
    if (actualHash !== expectedHash) throw new ProviderError(mismatchCode)
    return actualHash
  } catch (error) {
    if (error instanceof ProviderError) throw error
    if (error?.code === 'ENOENT') throw new ProviderError(missingCode, { cause: error })
    throw new ProviderError(mismatchCode, { cause: error })
  }
}

const isSupportedMvpCharacter = (character) => {
  if (typeof character !== 'string' || [...character].length !== 1) return false
  const codePoint = character.codePointAt(0)
  return (codePoint >= 0x3400 && codePoint <= 0x4dbf)
    || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
}

const validateDimensions = (dimensions) => {
  const width = Number(dimensions?.width)
  const height = Number(dimensions?.height)
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width < 16 || height < 16 || width > 1024 || height > 1024) {
    throw new ProviderError('GLYPH_DIMENSIONS_INVALID')
  }
  return { width, height }
}

export class SourceHanSerifGlyphProvider {
  #cache = new Map()

  static async create({
    fontPath = defaultFontPath,
    licensePath = defaultLicensePath,
    expectedFontSha256 = SOURCE_HAN_SERIF_SC_FONT_SHA256,
    expectedLicenseSha256 = SOURCE_HAN_SERIF_SC_LICENSE_SHA256,
    familyAlias = 'ZiYouFangSourceHanSerifSC',
    cacheEntries = 512
  } = {}) {
    await verifyFile({
      path: fontPath,
      expectedHash: expectedFontSha256,
      missingCode: 'GLYPH_FONT_NOT_FOUND',
      mismatchCode: 'GLYPH_FONT_HASH_MISMATCH'
    })
    await verifyFile({
      path: licensePath,
      expectedHash: expectedLicenseSha256,
      missingCode: 'GLYPH_LICENSE_NOT_FOUND',
      mismatchCode: 'GLYPH_LICENSE_HASH_MISMATCH'
    })
    const registrationKey = `${fontPath}:${expectedFontSha256}:${familyAlias}`
    if (!registeredFonts.has(registrationKey)) {
      const fontKey = GlobalFonts.registerFromPath(fontPath, familyAlias)
      if (!fontKey) throw new ProviderError('GLYPH_FONT_REGISTRATION_FAILED')
      registeredFonts.set(registrationKey, fontKey)
    }
    return new SourceHanSerifGlyphProvider({
      familyAlias,
      fontSha256: expectedFontSha256,
      cacheEntries
    })
  }

  constructor({ familyAlias, fontSha256, cacheEntries }) {
    this.familyAlias = familyAlias
    this.cacheEntries = cacheEntries
    this.version = `source-han-serif-sc-regular@${SOURCE_HAN_SERIF_SC_RELEASE}+${fontSha256}+${SOURCE_HAN_SERIF_RENDERER_VERSION}`
  }

  async render(character, dimensions) {
    if (!isSupportedMvpCharacter(character)) throw new ProviderError('GLYPH_REFERENCE_NOT_FOUND')
    const { width, height } = validateDimensions(dimensions)
    const cacheKey = `${character}:${width}x${height}`
    const cached = this.#cache.get(cacheKey)
    if (cached) return cached

    const pending = Promise.resolve().then(() => {
      const canvas = createCanvas(width, height)
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#000000'
      const fontSize = Math.max(12, Math.floor(Math.min(width, height) * 0.86))
      context.font = `${fontSize}px "${this.familyAlias}"`
      const metrics = context.measureText(character)
      const x = width / 2 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2
      const y = height / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
      context.fillText(character, x, y)
      return Object.freeze({
        dataUrl: `data:image/png;base64,${canvas.encodeSync('png').toString('base64')}`,
        version: this.version
      })
    })
    this.#cache.set(cacheKey, pending)
    if (this.#cache.size > this.cacheEntries) this.#cache.delete(this.#cache.keys().next().value)
    try {
      return await pending
    } catch (error) {
      this.#cache.delete(cacheKey)
      throw new ProviderError('GLYPH_RENDER_FAILED', { cause: error })
    }
  }
}
