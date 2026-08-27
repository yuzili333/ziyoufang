import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { ProviderError } from './provider-error.mjs'

const defaultFixtureRoot = new URL('../../../harness/fixtures/', import.meta.url)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export class ApprovedFixtureGlyphProvider {
  #entries
  #cache = new Map()

  static async create({ fixtureRoot = defaultFixtureRoot } = {}) {
    const metadata = JSON.parse(await readFile(new URL('metadata/multi-grid-v1.json', fixtureRoot), 'utf8'))
    if (metadata.synthetic !== true || metadata.containsPersonalData !== false
      || !String(metadata.glyphReferenceUse).startsWith('Non-shipping synthetic regression only')) {
      throw new Error('SYNTHETIC_GLYPH_GOVERNANCE_INVALID')
    }
    if (!metadata.glyphReferenceVersion || !Array.isArray(metadata.glyphReferences)) {
      throw new Error('SYNTHETIC_GLYPH_METADATA_INVALID')
    }
    const entries = new Map()
    for (const entry of metadata.glyphReferences) {
      if (typeof entry?.character !== 'string' || [...entry.character].length !== 1
        || !/^synthetic-glyph-\d{2}\.png$/.test(entry.file)
        || !/^[a-f0-9]{64}$/.test(entry.sha256)
        || entries.has(entry.character)) {
        throw new Error('SYNTHETIC_GLYPH_METADATA_INVALID')
      }
      entries.set(entry.character, { file: entry.file, sha256: entry.sha256 })
    }
    return new ApprovedFixtureGlyphProvider({
      fixtureRoot,
      version: metadata.glyphReferenceVersion,
      entries
    })
  }

  constructor({ fixtureRoot, version, entries }) {
    this.fixtureRoot = fixtureRoot
    this.version = version
    this.#entries = entries
  }

  async render(character) {
    const entry = this.#entries.get(character)
    if (!entry) throw new ProviderError('GLYPH_REFERENCE_NOT_FOUND')
    let encoded = this.#cache.get(character)
    if (!encoded) {
      encoded = await readFile(new URL(`references/${entry.file}`, this.fixtureRoot))
      if (sha256(encoded) !== entry.sha256) throw new ProviderError('GLYPH_REFERENCE_HASH_MISMATCH')
      this.#cache.set(character, encoded)
    }
    return {
      dataUrl: `data:image/png;base64,${encoded.toString('base64')}`,
      version: this.version
    }
  }
}
