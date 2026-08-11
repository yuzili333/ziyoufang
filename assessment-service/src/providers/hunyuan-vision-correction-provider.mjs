import { createHmac } from 'node:crypto'

import { ProviderError } from './provider-error.mjs'
import { requestJson } from './request-json.mjs'

const DEFAULT_ENDPOINT = 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions'
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
const MAXIMUM_IMAGE_DATA_URL_BYTES = 4 * 1024 * 1024
const ISSUE_CODE = /^[A-Z][A-Z0-9_]{1,63}$/
const ITEM_KEYS = new Set([
  'characterIndex', 'issueCodes', 'observations', 'correctionSteps', 'confidence', 'needsRetry'
])

const modelOutputError = () => new ProviderError('MODEL_OUTPUT_INVALID', { retryable: true })

const assertStringList = (value, maximum, maximumCharacters) => {
  if (!Array.isArray(value) || value.length > maximum
    || value.some((item) => typeof item !== 'string' || !item.trim() || [...item].length > maximumCharacters)) {
    throw modelOutputError()
  }
}

const parseModelJson = (content) => {
  if (typeof content !== 'string') throw modelOutputError()
  if (Buffer.byteLength(content, 'utf8') > 32 * 1024) throw modelOutputError()
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    throw modelOutputError()
  }
}

export function validateCorrectionBatch(value, expectedItems) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => key !== 'items')) {
    throw modelOutputError()
  }
  if (!Array.isArray(value.items) || value.items.length > 8 || value.items.length !== expectedItems.length) {
    throw modelOutputError()
  }
  const expectedByIndex = new Map(expectedItems.map((item) => [item.characterIndex, item]))
  const seen = new Set()
  for (const item of value.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw modelOutputError()
    if (Object.keys(item).length !== ITEM_KEYS.size || Object.keys(item).some((key) => !ITEM_KEYS.has(key))) {
      throw modelOutputError()
    }
    const expected = expectedByIndex.get(item.characterIndex)
    if (!expected || seen.has(item.characterIndex)) throw modelOutputError()
    seen.add(item.characterIndex)
    assertStringList(item.issueCodes, 32, 64)
    if (new Set(item.issueCodes).size !== item.issueCodes.length) throw modelOutputError()
    const allowedCodes = new Set(expected.issueCodes)
    if (item.issueCodes.length !== allowedCodes.size || item.issueCodes.some((code) => !allowedCodes.has(code))) {
      throw modelOutputError()
    }
    assertStringList(item.observations, 3, 120)
    assertStringList(item.correctionSteps, 3, 80)
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) throw modelOutputError()
    if (typeof item.needsRetry !== 'boolean') throw modelOutputError()
  }
  return value
}

const assertInputItem = (item) => {
  if (!Number.isInteger(item?.characterIndex) || item.characterIndex < 0) throw new ProviderError('MODEL_INPUT_INVALID')
  if (typeof item.expectedCharacter !== 'string' || [...item.expectedCharacter].length !== 1) {
    throw new ProviderError('MODEL_INPUT_INVALID')
  }
  if (!DATA_URL.test(item.cropImageDataUrl) || !DATA_URL.test(item.glyphImageDataUrl)) {
    throw new ProviderError('MODEL_IMAGE_DATA_URL_INVALID')
  }
  if (Buffer.byteLength(item.cropImageDataUrl) > MAXIMUM_IMAGE_DATA_URL_BYTES
    || Buffer.byteLength(item.glyphImageDataUrl) > MAXIMUM_IMAGE_DATA_URL_BYTES) {
    throw new ProviderError('MODEL_IMAGE_TOO_LARGE')
  }
  if (!Array.isArray(item.issueCodes) || item.issueCodes.length === 0
    || new Set(item.issueCodes).size !== item.issueCodes.length
    || item.issueCodes.some((code) => !ISSUE_CODE.test(code))) {
    throw new ProviderError('MODEL_ISSUE_CODES_INVALID')
  }
  if (!Array.isArray(item.ocrCandidates) || item.ocrCandidates.length > 3
    || item.ocrCandidates.some((candidate) => !candidate || typeof candidate !== 'object'
      || Object.keys(candidate).some((key) => !['text', 'confidence'].includes(key))
      || typeof candidate.text !== 'string' || [...candidate.text].length > 2
      || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1)) {
    throw new ProviderError('MODEL_OCR_CANDIDATES_INVALID')
  }
  if (!item.features || typeof item.features !== 'object' || Array.isArray(item.features)) {
    throw new ProviderError('MODEL_FEATURES_INVALID')
  }
  for (const [key, value] of Object.entries(item.features)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key) || !Number.isFinite(value)) {
      throw new ProviderError('MODEL_FEATURES_INVALID')
    }
  }
}

const buildMessages = (items) => {
  const evidence = items.map((item) => ({
    characterIndex: item.characterIndex,
    expectedCharacter: item.expectedCharacter,
    ocrCandidates: item.ocrCandidates.slice(0, 3),
    issueCodes: item.issueCodes,
    features: item.features
  }))
  const content = [{
    type: 'text',
    text: [
      '只解释给定的确定性书写证据，不得修改识别字、分类、分数或问题代码。',
      '不得推断人格、学习能力或静态照片无法证明的实际笔顺。',
      '用适合小学生的简短中文，返回一个 JSON 对象，且只含 items。',
      '每项只含 characterIndex、issueCodes、observations、correctionSteps、confidence、needsRetry；建议最多3条。',
      JSON.stringify({ evidence })
    ].join('\n')
  }]
  for (const item of items) {
    content.push({ type: 'text', text: `字序 ${item.characterIndex}：手写字裁剪图` })
    content.push({ type: 'image_url', image_url: { url: item.cropImageDataUrl } })
    content.push({ type: 'text', text: `字序 ${item.characterIndex}：标准字参考图` })
    content.push({ type: 'image_url', image_url: { url: item.glyphImageDataUrl } })
  }
  return [
    { role: 'system', content: '你是汉字书写证据解释器，只输出符合要求的 JSON。' },
    { role: 'user', content }
  ]
}

export class HunyuanVisionCorrectionProvider {
  constructor({
    enabled = false,
    apiKey,
    model,
    endpoint = DEFAULT_ENDPOINT,
    promptVersion,
    fetchImpl = globalThis.fetch,
    sleep,
    timeoutMs = 30_000,
    inputMicrosPerMillionTokens,
    outputMicrosPerMillionTokens,
    pricingVersion,
    traceHashSecret
  } = {}) {
    this.enabled = enabled
    this.apiKey = apiKey
    this.model = model
    this.endpoint = endpoint
    this.promptVersion = promptVersion
    this.fetchImpl = fetchImpl
    this.sleep = sleep
    this.timeoutMs = timeoutMs
    this.inputMicrosPerMillionTokens = inputMicrosPerMillionTokens
    this.outputMicrosPerMillionTokens = outputMicrosPerMillionTokens
    this.pricingVersion = pricingVersion
    this.traceHashSecret = traceHashSecret
    this.name = 'tencent-hunyuan-vision'
    this.requiresVisualEvidence = true
  }

  assertEnabled() {
    if (!this.enabled) throw new ProviderError('POC_PROVIDER_DISABLED')
    if (!this.apiKey || !this.model || !this.promptVersion) throw new ProviderError('MODEL_CONFIGURATION_REQUIRED')
    if (!this.traceHashSecret) throw new ProviderError('PROVIDER_TRACE_HASH_SECRET_REQUIRED')
    if (!this.pricingVersion
      || !Number.isInteger(this.inputMicrosPerMillionTokens) || this.inputMicrosPerMillionTokens < 0
      || !Number.isInteger(this.outputMicrosPerMillionTokens) || this.outputMicrosPerMillionTokens < 0) {
      throw new ProviderError('MODEL_PRICING_CONFIGURATION_REQUIRED')
    }
    const url = new URL(this.endpoint)
    if (url.protocol !== 'https:' || url.hostname !== 'api.hunyuan.cloud.tencent.com' || url.pathname !== '/v1/chat/completions') {
      throw new ProviderError('MODEL_ENDPOINT_NOT_ALLOWED')
    }
  }

  async analyzeBatch({ items }) {
    this.assertEnabled()
    if (!Array.isArray(items) || items.length === 0 || items.length > 8) throw new ProviderError('MODEL_BATCH_INVALID')
    items.forEach(assertInputItem)
    if (new Set(items.map((item) => item.characterIndex)).size !== items.length) {
      throw new ProviderError('MODEL_DUPLICATE_CHARACTER_INDEX')
    }
    const messages = buildMessages(items)
    let lastError
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const payload = JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.1,
          stream: false
        })
        const { body } = await requestJson({
          fetchImpl: this.fetchImpl,
          timeoutMs: this.timeoutMs,
          maximumAttempts: 1,
          sleep: this.sleep,
          createRequest: () => ({
            url: this.endpoint,
            options: {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${this.apiKey}`
              },
              body: payload
            }
          })
        })
        const content = body?.choices?.[0]?.message?.content
        const result = validateCorrectionBatch(parseModelJson(content), items)
        const rawInputUnits = Number(body?.usage?.prompt_tokens ?? 0)
        const rawOutputUnits = Number(body?.usage?.completion_tokens ?? 0)
        const inputUnits = Number.isFinite(rawInputUnits) && rawInputUnits >= 0 ? rawInputUnits : 0
        const outputUnits = Number.isFinite(rawOutputUnits) && rawOutputUnits >= 0 ? rawOutputUnits : 0
        const costMicros = Math.round(
          inputUnits * this.inputMicrosPerMillionTokens / 1_000_000
          + outputUnits * this.outputMicrosPerMillionTokens / 1_000_000
        )
        return {
          ...result,
          provider: this.name,
          providerVersion: this.model,
          promptVersion: this.promptVersion,
          providerTraceHash: typeof body?.id === 'string'
            ? createHmac('sha256', this.traceHashSecret).update(body.id).digest('hex')
            : null,
          usage: {
            provider: this.name,
            operation: 'analyze_correction_batch',
            requestCount: attempt,
            inputUnits,
            outputUnits,
            costMicros,
            pricingVersion: this.pricingVersion,
            cacheHit: false
          }
        }
      } catch (error) {
        lastError = error
        if (!(error instanceof ProviderError) || !error.retryable || attempt === 2) throw error
        if (this.sleep) await this.sleep(100 * attempt)
      }
    }
    throw lastError
  }
}
