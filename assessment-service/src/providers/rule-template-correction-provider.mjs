import { safeErrorCode } from '../telemetry.mjs'
import { ProviderError } from './provider-error.mjs'

const TEMPLATES = {
  CONTENT_MISMATCH: {
    observation: '这个字和练习目标不一致。',
    step: '看清目标字，再慢慢写一遍。'
  },
  CENTER_OFFSET_LEFT: {
    observation: '字的重心偏向左边。',
    step: '下一次把字向方格中间移动一点。'
  },
  CENTER_OFFSET_RIGHT: {
    observation: '字的重心偏向右边。',
    step: '下一次把字向方格中间移动一点。'
  },
  CENTER_OFFSET_UP: {
    observation: '字的重心偏向上方。',
    step: '下一次把字向方格中间下移一点。'
  },
  CENTER_OFFSET_DOWN: {
    observation: '字的重心偏向下方。',
    step: '下一次把字向方格中间上移一点。'
  },
  GLYPH_TOO_LARGE: {
    observation: '字在方格里占得太满。',
    step: '四周留出一点空白再写。'
  },
  GLYPH_TOO_SMALL: {
    observation: '字在方格里显得偏小。',
    step: '保持居中，把主要笔画写得舒展一点。'
  },
  STROKE_FORM_DIFFERENT: {
    observation: '有些笔画的形态和标准字差异较明显。',
    step: '先对照标准字，慢写差异最大的一笔。'
  },
  FRAME_STRUCTURE_DIFFERENT: {
    observation: '部件之间的疏密或位置关系需要调整。',
    step: '先看清各部分的上下左右关系，再分步书写。'
  },
  GLYPH_PROPORTION_IMBALANCED: {
    observation: '字的宽高或主要部分比例不够协调。',
    step: '对照标准字，先调整主体的宽高比例。'
  },
  OCR_CONFLICT: {
    observation: '当前图片还不能确认这个字。',
    step: '把相机放正、拍清楚后再试一次。'
  },
  CELL_PROCESSING_FAILED: {
    observation: '这个方格暂时没有分析成功。',
    step: '请单独拍清楚这个字后重试。'
  }
}

const genericTemplate = (code) => ({
  observation: `检测到需要关注的书写问题（${code}）。`,
  step: '对照标准字，先调整最明显的一处再练习。'
})

export class RuleTemplateCorrectionProvider {
  constructor({ version = 'rule-template-v1' } = {}) {
    this.name = 'rule-template'
    this.version = version
    this.requiresVisualEvidence = false
  }

  async analyzeBatch({ items, degradationCause } = {}) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 8) throw new Error('MODEL_BATCH_INVALID')
    return {
      items: items.map((item) => {
        const templates = item.issueCodes.map((code) => TEMPLATES[code] ?? genericTemplate(code))
        return {
          characterIndex: item.characterIndex,
          issueCodes: [...item.issueCodes],
          observations: templates.slice(0, 3).map((template) => template.observation),
          correctionSteps: templates.slice(0, 3).map((template) => template.step),
          confidence: 1,
          needsRetry: item.issueCodes.some((code) => ['OCR_CONFLICT', 'CELL_PROCESSING_FAILED'].includes(code))
        }
      }),
      provider: this.name,
      providerVersion: this.version,
      degraded: true,
      degradationCode: degradationCause ? safeErrorCode(degradationCause) : 'MODEL_NOT_REQUESTED',
      usage: {
        provider: this.name,
        operation: 'rule_template_advice',
        requestCount: 0,
        inputUnits: 0,
        outputUnits: 0,
        costMicros: 0,
        cacheHit: true
      }
    }
  }
}

export class FallbackVisionCorrectionProvider {
  constructor({ primary, fallback = new RuleTemplateCorrectionProvider() }) {
    this.primary = primary
    this.fallback = fallback
    this.name = primary.name
    this.requiresVisualEvidence = primary.requiresVisualEvidence === true
  }

  async analyzeBatch(input) {
    try {
      return await this.primary.analyzeBatch(input)
    } catch (error) {
      if (!(error instanceof ProviderError)
        || (!error.retryable && error.code !== 'POC_PROVIDER_DISABLED')) throw error
      return this.fallback.analyzeBatch({ ...input, degradationCause: error })
    }
  }

  async analyzeWithoutVisualEvidence(input, error) {
    return this.fallback.analyzeBatch({ ...input, degradationCause: error })
  }
}
