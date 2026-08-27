import { ProviderError } from '../providers/provider-error.mjs'

const average = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
const emptyBreakdown = () => ({
  strokeStandard: null,
  frameStructure: null,
  glyphProportion: null,
  positionLayout: null,
  stability: null
})

const ISSUE_DETAILS = {
  CONTENT_MISMATCH: {
    title: '目标字与识别字不同',
    detail: ({ expectedCharacter, recognizedCharacter }) => `两次稳定识别均为“${recognizedCharacter}”，目标字为“${expectedCharacter}”。`
  },
  CENTER_OFFSET_LEFT: {
    title: '整体稍偏左',
    detail: () => '手写字重心位于田字格中线左侧。'
  },
  CENTER_OFFSET_RIGHT: {
    title: '整体稍偏右',
    detail: () => '手写字重心位于田字格中线右侧。'
  },
  CENTER_OFFSET_UP: {
    title: '整体稍偏上',
    detail: () => '手写字重心位于田字格中线偏上。'
  },
  CENTER_OFFSET_DOWN: {
    title: '整体稍偏下',
    detail: () => '手写字重心位于田字格中线偏下。'
  },
  GLYPH_TOO_LARGE: {
    title: '字形偏大',
    detail: () => '手写字占格面积比标准字形偏大。'
  },
  GLYPH_TOO_SMALL: {
    title: '字形偏小',
    detail: () => '手写字占格面积比标准字形偏小。'
  },
  STROKE_FORM_DIFFERENT: {
    title: '笔画形态需调整',
    detail: () => '手写笔画骨架和墨迹轮廓与标准字形存在明显差异。'
  },
  FRAME_STRUCTURE_DIFFERENT: {
    title: '间架结构需调整',
    detail: () => '手写字的象限分布、投影或部件关系与标准字形存在明显差异。'
  },
  GLYPH_PROPORTION_IMBALANCED: {
    title: '字形比例需调整',
    detail: () => '手写字的宽高比例或占格比例与标准字形存在明显差异。'
  },
  OCR_CONFLICT: {
    title: '还不能确定',
    detail: () => '两次识别结果不一致或置信度不足，不能形成确定结论。'
  },
  CELL_PROCESSING_FAILED: {
    title: '这个字没有分析成功',
    detail: () => '当前单格无法完成识别和对比。'
  }
}

const buildIssues = (codes, context) => codes.map((code) => {
  const definition = ISSUE_DETAILS[code] ?? {
    title: '需要继续调整', detail: () => `检测到书写问题：${code}。`
  }
  return { code, title: definition.title, detail: definition.detail(context) }
})

const DIFFERENCE_ANNOTATIONS = {
  CONTENT_MISMATCH: { anchor: 'center', label: '目标字不一致' },
  CENTER_OFFSET_LEFT: { anchor: 'left', label: '整体偏左' },
  CENTER_OFFSET_RIGHT: { anchor: 'right', label: '整体偏右' },
  CENTER_OFFSET_UP: { anchor: 'top', label: '整体偏上' },
  CENTER_OFFSET_DOWN: { anchor: 'bottom', label: '整体偏下' },
  GLYPH_TOO_LARGE: { anchor: 'edge', label: '占格偏大' },
  GLYPH_TOO_SMALL: { anchor: 'edge', label: '占格偏小' },
  STROKE_FORM_DIFFERENT: { anchor: 'center', label: '笔画形态' },
  FRAME_STRUCTURE_DIFFERENT: { anchor: 'center', label: '间架结构' },
  GLYPH_PROPORTION_IMBALANCED: { anchor: 'edge', label: '字形比例' }
}

const buildDifferenceAnnotations = (codes) => {
  const usedAnchors = new Set()
  return codes
    .flatMap((code) => DIFFERENCE_ANNOTATIONS[code] ? [{ code, ...DIFFERENCE_ANNOTATIONS[code] }] : [])
    .filter((annotation) => {
      if (usedAnchors.has(annotation.anchor)) return false
      usedAnchors.add(annotation.anchor)
      return true
    })
    .slice(0, 3)
}

export class DeterministicCharacterDecisionEngine {
  constructor({
    version = 'deterministic-character-decision-v1',
    highConfidenceThreshold = 0.9,
    lowConfidenceThreshold = 0.6,
    correctionScoreThreshold = 80
  } = {}) {
    this.version = version
    this.highConfidenceThreshold = highConfidenceThreshold
    this.lowConfidenceThreshold = lowConfidenceThreshold
    this.correctionScoreThreshold = correctionScoreThreshold
  }

  decide({ expectedCharacter, ocrResult, polygon }) {
    if (typeof expectedCharacter !== 'string' || [...expectedCharacter].length !== 1) {
      throw new ProviderError('EXPECTED_CHARACTER_INVALID')
    }
    const passes = ocrResult?.passes ?? []
    const candidates = passes.map(({ text, confidence }) => ({ text, confidence }))
    const base = {
      index: ocrResult.index,
      expectedCharacter,
      polygon,
      ocrCandidates: candidates,
      differenceAnnotations: [],
      growthSummary: {
        status: 'collecting',
        comparablePracticeCount: 0,
        requiredPracticeCount: 3,
        recentAverage: null,
        stabilityScore: null,
        monitoringStatus: 'not_eligible',
        monitoringReasonCodes: []
      }
    }
    if (ocrResult?.status === 'failed' || passes.length === 0) {
      return {
        ...base,
        recognizedCharacter: null,
        confidence: 0,
        category: 'failed',
        score: null,
        scoreBreakdown: emptyBreakdown(),
        issueCodes: ['CELL_PROCESSING_FAILED'],
        issues: buildIssues(['CELL_PROCESSING_FAILED'], { expectedCharacter }),
        needsRetry: true
      }
    }
    const stableText = passes.every((pass) => pass.text === passes[0].text)
    const minimumConfidence = Math.min(...passes.map((pass) => pass.confidence))
    if (!stableText || minimumConfidence < this.lowConfidenceThreshold) {
      return {
        ...base,
        recognizedCharacter: null,
        confidence: Math.max(...passes.map((item) => item.confidence)),
        category: 'uncertain',
        score: null,
        scoreBreakdown: emptyBreakdown(),
        issueCodes: ['OCR_CONFLICT'],
        issues: buildIssues(['OCR_CONFLICT'], { expectedCharacter }),
        needsRetry: true
      }
    }
    const recognizedCharacter = passes[0].text
    if (recognizedCharacter !== expectedCharacter
      && (passes.length < 2 || minimumConfidence < this.highConfidenceThreshold)) {
      return {
        ...base,
        recognizedCharacter: null,
        confidence: minimumConfidence,
        category: 'uncertain',
        score: null,
        scoreBreakdown: emptyBreakdown(),
        issueCodes: ['OCR_CONFLICT'],
        issues: buildIssues(['OCR_CONFLICT'], { expectedCharacter }),
        needsRetry: true
      }
    }
    const dimensions = ocrResult.dimensions
    if (!dimensions || Object.values(dimensions).some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
      throw new ProviderError('DETERMINISTIC_SCORE_EVIDENCE_INVALID')
    }
    const scoreBreakdown = { ...dimensions, stability: null }
    const score = average(Object.values(dimensions))
    const growthSummary = {
      ...base.growthSummary,
      comparablePracticeCount: 1,
      requiredPracticeCount: 2
    }
    if (recognizedCharacter !== expectedCharacter) {
      const context = { expectedCharacter, recognizedCharacter }
      const issueCodes = ['CONTENT_MISMATCH', ...(ocrResult.deterministicIssueCodes ?? [])]
      return {
        ...base,
        growthSummary,
        recognizedCharacter,
        confidence: minimumConfidence,
        category: 'wrong',
        score,
        scoreBreakdown,
        issueCodes,
        issues: buildIssues(issueCodes, context),
        differenceAnnotations: buildDifferenceAnnotations(issueCodes),
        needsRetry: false
      }
    }
    const issueCodes = score < this.correctionScoreThreshold
      ? [...ocrResult.deterministicIssueCodes]
      : []
    const category = issueCodes.length > 0 ? 'needs_correction' : 'normal'
    return {
      ...base,
      growthSummary,
      recognizedCharacter,
      confidence: minimumConfidence,
      category,
      score,
      scoreBreakdown,
      issueCodes,
      issues: buildIssues(issueCodes, { expectedCharacter, recognizedCharacter }),
      differenceAnnotations: buildDifferenceAnnotations(issueCodes),
      needsRetry: false
    }
  }
}
