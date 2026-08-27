import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { DeterministicGridSegmenter } from '../image/grid-segmenter.mjs'
import { PixelGlyphFeatureProvider } from '../image/pixel-glyph-feature-provider.mjs'
import { DeterministicImageQualityAnalyzer } from '../image/quality-analyzer.mjs'
import { ApprovedFixtureGlyphProvider } from '../providers/approved-fixture-glyph-provider.mjs'
import { PageFirstOcrEvidenceProvider } from '../providers/page-first-ocr-evidence-provider.mjs'
import { RuleTemplateCorrectionProvider } from '../providers/rule-template-correction-provider.mjs'
import { SyntheticPageOcrProvider } from '../providers/synthetic-page-ocr-provider.mjs'
import { AssessmentPipelineProvider, InMemoryMediaLoader } from './assessment-pipeline-provider.mjs'
import { DeterministicCharacterDecisionEngine } from './character-decision-engine.mjs'

const defaultFixtureRoot = new URL('../../../harness/fixtures/', import.meta.url)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export async function createApprovedSyntheticPipeline({
  fixtureRoot = defaultFixtureRoot,
  glyphProvider: providedGlyphProvider
} = {}) {
  const metadata = JSON.parse(await readFile(new URL('metadata/multi-grid-v1.json', fixtureRoot), 'utf8'))
  if (metadata.synthetic !== true || metadata.containsPersonalData !== false) {
    throw new Error('SYNTHETIC_FIXTURE_GOVERNANCE_INVALID')
  }
  const clearEntry = metadata.files.find((item) => item.name === 'multi-grid-clear-v1.png')
  if (!clearEntry?.sha256) throw new Error('SYNTHETIC_FIXTURE_HASH_REQUIRED')
  const image = await readFile(new URL('inputs/multi-grid-clear-v1.png', fixtureRoot))
  if (sha256(image) !== clearEntry.sha256) throw new Error('SYNTHETIC_FIXTURE_HASH_MISMATCH')
  const glyphProvider = providedGlyphProvider ?? await ApprovedFixtureGlyphProvider.create({ fixtureRoot })
  const featureProvider = new PixelGlyphFeatureProvider({
    glyphProvider,
    issueThreshold: 85
  })
  const ocrProvider = new PageFirstOcrEvidenceProvider({
    rawProvider: new SyntheticPageOcrProvider({
      renderedText: metadata.renderedText,
      rows: metadata.grid.rows,
      columns: metadata.grid.columns
    }),
    featureProvider
  })
  const provider = new AssessmentPipelineProvider({
    mediaLoader: new InMemoryMediaLoader([[clearEntry.sha256, image]]),
    qualityAnalyzer: new DeterministicImageQualityAnalyzer(),
    segmenter: new DeterministicGridSegmenter({
      rows: metadata.grid.rows,
      columns: metadata.grid.columns
    }),
    ocrProvider,
    decisionEngine: new DeterministicCharacterDecisionEngine({ correctionScoreThreshold: 92 }),
    adviceProvider: new RuleTemplateCorrectionProvider({ version: 'rule-template-pipeline-v1' }),
    glyphProvider,
    pipelineVersion: 'synthetic-page-ocr-pixel-glyph-pipeline-v2'
  })
  return {
    provider,
    fixture: {
      fixtureId: metadata.fixtureId,
      imageSha256: clearEntry.sha256,
      targetText: metadata.targetText,
      containsPersonalData: metadata.containsPersonalData
    }
  }
}
