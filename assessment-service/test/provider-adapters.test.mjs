import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HunyuanVisionCorrectionProvider,
  validateCorrectionBatch
} from '../src/providers/hunyuan-vision-correction-provider.mjs'
import { ProviderError } from '../src/providers/provider-error.mjs'
import { requestJson } from '../src/providers/request-json.mjs'
import {
  FallbackVisionCorrectionProvider,
  RuleTemplateCorrectionProvider
} from '../src/providers/rule-template-correction-provider.mjs'
import {
  TencentCloudHandwritingOcrProvider,
  createTencentCloudAuthorization
} from '../src/providers/tencent-cloud-ocr-provider.mjs'

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' }
})

const ocrSuccess = {
  Response: {
    TextDetections: [{
      DetectedText: '永',
      Confidence: 96,
      Polygon: [{ X: 10, Y: 20 }, { X: 90, Y: 20 }, { X: 90, Y: 180 }, { X: 10, Y: 180 }],
      WordPolygon: [{
        LeftTop: { X: 10, Y: 20 }, RightTop: { X: 90, Y: 20 },
        RightBottom: { X: 90, Y: 180 }, LeftBottom: { X: 10, Y: 180 }
      }]
    }],
    Angle: 0,
    RequestId: 'provider-request-id-must-not-leak'
  }
}

const correctionInput = {
  items: [{
    characterIndex: 2,
    expectedCharacter: '永',
    cropImageDataUrl: 'data:image/png;base64,AA==',
    glyphImageDataUrl: 'data:image/png;base64,AQ==',
    ocrCandidates: [{ text: '永', confidence: 0.96 }],
    issueCodes: ['CENTER_OFFSET_LEFT'],
    features: { centerOffsetX: -0.2, inkRatio: 0.4 }
  }]
}

const correctionOutput = {
  items: [{
    characterIndex: 2,
    issueCodes: ['CENTER_OFFSET_LEFT'],
    observations: ['字的重心偏向左边。'],
    correctionSteps: ['把字向方格中间移动一点。'],
    confidence: 0.91,
    needsRetry: false
  }]
}

test('TC3 authorization is deterministic and binds the payload', () => {
  const base = {
    secretId: 'AKIDEXAMPLE', secretKey: 'SECRETEXAMPLE', timestamp: 1_597_080_000
  }
  const first = createTencentCloudAuthorization({ ...base, payload: '{"ImageBase64":"AA=="}' })
  const second = createTencentCloudAuthorization({ ...base, payload: '{"ImageBase64":"AQ=="}' })
  assert.match(first, /^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\/2020-08-10\/ocr\/tc3_request, SignedHeaders=content-type;host, Signature=[a-f0-9]{64}$/)
  assert.notEqual(first, second)
  assert.equal(first.includes('SECRETEXAMPLE'), false)
})

test('OCR provider is disabled by default and never reaches the network', async () => {
  let called = false
  const provider = new TencentCloudHandwritingOcrProvider({ fetchImpl: async () => { called = true } })
  await assert.rejects(
    provider.recognizePage({ imageBase64: 'AA==', imageWidth: 100, imageHeight: 200 }),
    (error) => error.code === 'POC_PROVIDER_DISABLED'
  )
  assert.equal(called, false)
})

test('OCR provider signs the official request and normalizes confidence and coordinates', async () => {
  let captured
  const provider = new TencentCloudHandwritingOcrProvider({
    enabled: true,
    secretId: 'secret-id',
    secretKey: 'secret-key',
    sessionToken: 'short-session-token',
    region: 'ap-guangzhou',
    now: () => 1_597_080_000_000,
    traceHashSecret: 'trace-secret',
    costMicrosPerCall: 700,
    pricingVersion: 'ocr-price-test-v1',
    fetchImpl: async (url, options) => {
      captured = { url, options }
      return jsonResponse(ocrSuccess)
    }
  })
  const result = await provider.recognizePage({ imageBase64: 'AA==', imageWidth: 100, imageHeight: 200 })
  assert.equal(captured.url, 'https://ocr.tencentcloudapi.com/')
  assert.equal(captured.options.headers['x-tc-action'], 'GeneralHandwritingOCR')
  assert.equal(captured.options.headers['x-tc-version'], '2018-11-19')
  assert.equal(captured.options.headers['x-tc-region'], 'ap-guangzhou')
  assert.equal(captured.options.headers['x-tc-token'], 'short-session-token')
  assert.match(captured.options.headers.authorization, /^TC3-HMAC-SHA256 /)
  assert.equal(captured.options.headers.authorization.includes('secret-key'), false)
  assert.deepEqual(JSON.parse(captured.options.body), {
    ImageBase64: 'AA==', Scene: 'only_hw', EnableWordPolygon: true, EnableDetectText: true
  })
  assert.equal(result.text, '永')
  assert.equal(result.lines[0].confidence, 0.96)
  assert.deepEqual(result.lines[0].polygon[2], { x: 0.9, y: 0.9 })
  assert.deepEqual(result.lines[0].words[0].polygon[0], { x: 0.1, y: 0.1 })
  assert.match(result.providerTraceHash, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(result).includes('provider-request-id-must-not-leak'), false)
  assert.equal(result.usage.costMicros, 700)
})

test('OCR provider retries retryable Tencent response errors within the fixed budget', async () => {
  let calls = 0
  const provider = new TencentCloudHandwritingOcrProvider({
    enabled: true,
    secretId: 'secret-id',
    secretKey: 'secret-key',
    maximumAttempts: 3,
    sleep: async () => {},
    costMicrosPerCall: 50,
    pricingVersion: 'ocr-price-test-v1',
    traceHashSecret: 'trace-secret',
    fetchImpl: async () => {
      calls += 1
      if (calls < 3) return jsonResponse({ Response: { Error: { Code: 'RequestLimitExceeded' } } })
      return jsonResponse(ocrSuccess)
    }
  })
  const result = await provider.recognizePage({ imageBase64: 'AA==', imageWidth: 100, imageHeight: 200 })
  assert.equal(calls, 3)
  assert.equal(result.usage.requestCount, 3)
  assert.equal(result.usage.costMicros, 150)
})

test('Hunyuan provider sends only bounded evidence and validates strict JSON output', async () => {
  let captured
  const provider = new HunyuanVisionCorrectionProvider({
    enabled: true,
    apiKey: 'hunyuan-key',
    model: 'hunyuan-vision',
    promptVersion: 'correction-v1',
    traceHashSecret: 'trace-secret',
    pricingVersion: 'hunyuan-price-test-v1',
    inputMicrosPerMillionTokens: 1_000_000,
    outputMicrosPerMillionTokens: 2_000_000,
    fetchImpl: async (url, options) => {
      captured = { url, options }
      return jsonResponse({
        id: 'model-request-id-must-not-leak',
        choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(correctionOutput)}\n\`\`\`` } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 }
      })
    }
  })
  const result = await provider.analyzeBatch(correctionInput)
  assert.equal(captured.url, 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions')
  assert.equal(captured.options.headers.authorization, 'Bearer hunyuan-key')
  const request = JSON.parse(captured.options.body)
  assert.equal(request.model, 'hunyuan-vision')
  assert.equal(request.stream, false)
  assert.equal(request.messages[1].content.filter((item) => item.type === 'image_url').length, 2)
  assert.deepEqual(result.items, correctionOutput.items)
  assert.equal(result.usage.inputUnits, 100)
  assert.equal(result.usage.outputUnits, 20)
  assert.equal(result.usage.costMicros, 140)
  assert.match(result.providerTraceHash, /^[a-f0-9]{64}$/)
  assert.equal(JSON.stringify(result).includes('model-request-id-must-not-leak'), false)
  assert.equal(JSON.stringify(result).includes('hunyuan-key'), false)
})

test('Hunyuan provider retries invalid JSON once and accepts only existing issue codes', async () => {
  let calls = 0
  const provider = new HunyuanVisionCorrectionProvider({
    enabled: true,
    apiKey: 'key',
    model: 'hunyuan-vision',
    promptVersion: 'correction-v1',
    traceHashSecret: 'trace-secret',
    pricingVersion: 'hunyuan-price-test-v1',
    inputMicrosPerMillionTokens: 0,
    outputMicrosPerMillionTokens: 0,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1
      return jsonResponse({
        choices: [{ message: { content: calls === 1 ? 'not-json' : JSON.stringify(correctionOutput) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      })
    }
  })
  const result = await provider.analyzeBatch(correctionInput)
  assert.equal(calls, 2)
  assert.equal(result.usage.requestCount, 2)

  const overridden = structuredClone(correctionOutput)
  overridden.items[0].issueCodes = ['MODEL_INVENTED_ISSUE']
  assert.throws(() => validateCorrectionBatch(overridden, correctionInput.items), /MODEL_OUTPUT_INVALID/)

  const omitted = structuredClone(correctionOutput)
  omitted.items[0].issueCodes = []
  assert.throws(() => validateCorrectionBatch(omitted, correctionInput.items), /MODEL_OUTPUT_INVALID/)
})

test('rule-template fallback preserves deterministic issue codes when the model is unavailable', async () => {
  const disabledPrimary = new HunyuanVisionCorrectionProvider()
  const provider = new FallbackVisionCorrectionProvider({
    primary: disabledPrimary,
    fallback: new RuleTemplateCorrectionProvider({ version: 'template-test-v1' })
  })
  const result = await provider.analyzeBatch(correctionInput)
  assert.equal(result.degraded, true)
  assert.equal(result.degradationCode, 'POC_PROVIDER_DISABLED')
  assert.deepEqual(result.items[0].issueCodes, ['CENTER_OFFSET_LEFT'])
  assert.equal(result.items[0].correctionSteps.length, 1)
  assert.equal(result.usage.costMicros, 0)
})

test('fallback does not hide invalid model input or unsafe configuration', async () => {
  const invalidPrimary = {
    name: 'invalid',
    async analyzeBatch() {
      throw new ProviderError('MODEL_INPUT_INVALID')
    }
  }
  const provider = new FallbackVisionCorrectionProvider({ primary: invalidPrimary })
  await assert.rejects(provider.analyzeBatch(correctionInput), /MODEL_INPUT_INVALID/)
})

test('shared provider transport retries 5xx but never retries a rejected 4xx request', async () => {
  let serverCalls = 0
  const recovered = await requestJson({
    timeoutMs: 100,
    maximumAttempts: 3,
    sleep: async () => {},
    createRequest: () => ({ url: 'https://provider.invalid', options: { method: 'POST' } }),
    fetchImpl: async () => {
      serverCalls += 1
      return serverCalls < 3 ? jsonResponse({ error: 'redacted' }, 503) : jsonResponse({ ok: true })
    }
  })
  assert.equal(serverCalls, 3)
  assert.deepEqual(recovered.body, { ok: true })

  let clientCalls = 0
  await assert.rejects(requestJson({
    timeoutMs: 100,
    maximumAttempts: 3,
    sleep: async () => {},
    createRequest: () => ({ url: 'https://provider.invalid', options: { method: 'POST' } }),
    fetchImpl: async () => {
      clientCalls += 1
      return jsonResponse({ secretProviderDetail: 'must-not-enter-error' }, 400)
    }
  }), (error) => error.code === 'PROVIDER_REQUEST_REJECTED' && !error.message.includes('secretProviderDetail'))
  assert.equal(clientCalls, 1)
})

test('shared provider transport turns aborts into a bounded timeout error', async () => {
  let calls = 0
  await assert.rejects(requestJson({
    timeoutMs: 2,
    maximumAttempts: 2,
    sleep: async () => {},
    createRequest: () => ({ url: 'https://provider.invalid', options: { method: 'POST' } }),
    fetchImpl: async (_url, options) => {
      calls += 1
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('request details must not escape')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }
  }), (error) => error.code === 'PROVIDER_TIMEOUT' && error.retryable === true)
  assert.equal(calls, 2)
})
