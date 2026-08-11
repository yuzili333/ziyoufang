import { createHash, createHmac } from 'node:crypto'

import { ProviderError, remoteProviderCode } from './provider-error.mjs'
import { requestJson } from './request-json.mjs'

const ACTION = 'GeneralHandwritingOCR'
const API_VERSION = '2018-11-19'
const HOST = 'ocr.tencentcloudapi.com'
const SERVICE = 'ocr'
const CONTENT_TYPE = 'application/json; charset=utf-8'
const MAXIMUM_BASE64_BYTES = 10 * 1024 * 1024

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const hmac = (key, value, encoding) => createHmac('sha256', key).update(value).digest(encoding)
const isoDate = (timestampSeconds) => new Date(timestampSeconds * 1000).toISOString().slice(0, 10)
const clamp = (value) => Math.max(0, Math.min(1, value))

export function createTencentCloudAuthorization({ secretId, secretKey, timestamp, payload }) {
  const date = isoDate(timestamp)
  const canonicalHeaders = `content-type:${CONTENT_TYPE}\nhost:${HOST}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256(payload)].join('\n')
  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, sha256(canonicalRequest)].join('\n')
  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, SERVICE)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = hmac(secretSigning, stringToSign, 'hex')
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

const assertImageInput = ({ imageBase64, imageWidth, imageHeight }) => {
  if (typeof imageBase64 !== 'string' || !imageBase64 || imageBase64.startsWith('data:')) {
    throw new ProviderError('OCR_IMAGE_BASE64_INVALID')
  }
  if (Buffer.byteLength(imageBase64, 'utf8') > MAXIMUM_BASE64_BYTES) {
    throw new ProviderError('OCR_IMAGE_TOO_LARGE')
  }
  if (!Number.isFinite(imageWidth) || imageWidth <= 0 || !Number.isFinite(imageHeight) || imageHeight <= 0) {
    throw new ProviderError('OCR_IMAGE_DIMENSIONS_INVALID')
  }
}

const normalizePoint = (point, width, height) => ({
  x: clamp(Number(point?.X ?? 0) / width),
  y: clamp(Number(point?.Y ?? 0) / height)
})

const normalizeWordPolygon = (word, width, height) => {
  if (!word) return null
  return [word.LeftTop, word.RightTop, word.RightBottom, word.LeftBottom]
    .map((point) => normalizePoint(point, width, height))
}

const normalizeOcrResponse = (response, { imageWidth, imageHeight, traceHashSecret }) => {
  if (!response || response.Error) {
    throw new ProviderError(remoteProviderCode('OCR', response?.Error?.Code), {
      retryable: /LimitExceeded|RequestLimitExceeded|InternalError|ResourceUnavailable/i.test(response?.Error?.Code ?? '')
    })
  }
  if (!Array.isArray(response.TextDetections) || typeof response.RequestId !== 'string') {
    throw new ProviderError('OCR_RESPONSE_INVALID', { retryable: true })
  }
  const lines = response.TextDetections.map((line) => {
    if (typeof line?.DetectedText !== 'string' || !Number.isFinite(line?.Confidence)) {
      throw new ProviderError('OCR_RESPONSE_INVALID', { retryable: true })
    }
    const characters = [...line.DetectedText]
    const wordPolygons = Array.isArray(line.WordPolygon) ? line.WordPolygon : []
    return {
      text: line.DetectedText,
      confidence: clamp(line.Confidence / 100),
      polygon: Array.isArray(line.Polygon)
        ? line.Polygon.map((point) => normalizePoint(point, imageWidth, imageHeight))
        : [],
      words: characters.map((text, index) => ({
        text,
        confidence: clamp(line.Confidence / 100),
        polygon: normalizeWordPolygon(wordPolygons[index], imageWidth, imageHeight)
      }))
    }
  })
  return {
    angle: Number.isFinite(response.Angle) ? response.Angle : 0,
    text: lines.map((line) => line.text).join('\n'),
    lines,
    providerTraceHash: createHmac('sha256', traceHashSecret).update(response.RequestId).digest('hex')
  }
}

export class TencentCloudHandwritingOcrProvider {
  constructor({
    enabled = false,
    secretId,
    secretKey,
    sessionToken,
    region,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    sleep,
    timeoutMs = 10_000,
    maximumAttempts = 3,
    costMicrosPerCall,
    pricingVersion,
    traceHashSecret
  } = {}) {
    this.enabled = enabled
    this.secretId = secretId
    this.secretKey = secretKey
    this.sessionToken = sessionToken
    this.region = region
    this.fetchImpl = fetchImpl
    this.now = now
    this.sleep = sleep
    this.timeoutMs = timeoutMs
    this.maximumAttempts = maximumAttempts
    this.costMicrosPerCall = costMicrosPerCall
    this.pricingVersion = pricingVersion
    this.traceHashSecret = traceHashSecret
    this.name = 'tencent-cloud-ocr'
    this.version = `${ACTION}@${API_VERSION}`
  }

  assertEnabled() {
    if (!this.enabled) throw new ProviderError('POC_PROVIDER_DISABLED')
    if (!this.secretId || !this.secretKey) throw new ProviderError('OCR_CREDENTIALS_REQUIRED')
    if (!this.traceHashSecret) throw new ProviderError('PROVIDER_TRACE_HASH_SECRET_REQUIRED')
    if (!this.pricingVersion || !Number.isInteger(this.costMicrosPerCall) || this.costMicrosPerCall < 0) {
      throw new ProviderError('OCR_PRICING_CONFIGURATION_REQUIRED')
    }
  }

  async recognizePage(input) {
    this.assertEnabled()
    assertImageInput(input)
    const payload = JSON.stringify({
      ImageBase64: input.imageBase64,
      Scene: 'only_hw',
      EnableWordPolygon: true,
      EnableDetectText: input.enableDetectText ?? true
    })
    const { body, attempt } = await requestJson({
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      maximumAttempts: this.maximumAttempts,
      sleep: this.sleep,
      validateBody: (candidate) => {
        if (!candidate?.Response || candidate.Response.Error) {
          throw new ProviderError(remoteProviderCode('OCR', candidate?.Response?.Error?.Code), {
            retryable: /LimitExceeded|RequestLimitExceeded|InternalError|ResourceUnavailable/i
              .test(candidate?.Response?.Error?.Code ?? '')
          })
        }
      },
      createRequest: () => {
        const timestamp = Math.floor(this.now() / 1000)
        const headers = {
          'content-type': CONTENT_TYPE,
          host: HOST,
          authorization: createTencentCloudAuthorization({
            secretId: this.secretId,
            secretKey: this.secretKey,
            timestamp,
            payload
          }),
          'x-tc-action': ACTION,
          'x-tc-timestamp': String(timestamp),
          'x-tc-version': API_VERSION
        }
        if (this.region) headers['x-tc-region'] = this.region
        if (this.sessionToken) headers['x-tc-token'] = this.sessionToken
        return { url: `https://${HOST}/`, options: { method: 'POST', headers, body: payload } }
      }
    })
    const result = normalizeOcrResponse(body?.Response, { ...input, traceHashSecret: this.traceHashSecret })
    return {
      ...result,
      provider: this.name,
      providerVersion: this.version,
      usage: {
        provider: this.name,
        operation: input.enableDetectText === false ? 'recognize_cell' : 'recognize_page',
        requestCount: attempt,
        inputUnits: attempt,
        outputUnits: [...result.text].length,
        costMicros: attempt * this.costMicrosPerCall,
        pricingVersion: this.pricingVersion,
        cacheHit: false
      }
    }
  }

  async recognizeCells({ cells }) {
    if (!Array.isArray(cells) || cells.length === 0 || cells.length > 32) {
      throw new ProviderError('OCR_CELL_BATCH_INVALID')
    }
    const results = []
    for (const cell of cells) {
      const result = await this.recognizePage({ ...cell, enableDetectText: false })
      results.push({ cellId: cell.cellId, ...result })
    }
    return results
  }
}
