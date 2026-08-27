import { createServer as createHttpServer } from 'node:http'
import { pathToFileURL } from 'node:url'

import express from 'express'

import { AssessmentOrchestrator } from './orchestrator.mjs'
import { createApprovedSyntheticPipeline } from './pipeline/approved-synthetic-pipeline.mjs'
import { SourceHanSerifGlyphProvider } from './providers/source-han-serif-glyph-provider.mjs'
import { MemoryAssessmentRepository } from './repository.mjs'
import { NonceReplayGuard, verifyRequest } from './security.mjs'
import { SafeTelemetry } from './telemetry.mjs'

export function createAssessmentApp({
  secret,
  replayGuard = new NonceReplayGuard(),
  telemetry = new SafeTelemetry(),
  orchestrator,
  assessmentEnabled = true
} = {}) {
  const disabledProvider = {
    name: 'disabled',
    async assess() { throw new Error('ASSESSMENT_PROVIDER_NOT_ENABLED') }
  }
  const effectiveOrchestrator = orchestrator ?? new AssessmentOrchestrator({
    repository: new MemoryAssessmentRepository(),
    provider: disabledProvider,
    telemetry
  })
  const effectiveTelemetry = effectiveOrchestrator.telemetry ?? telemetry
  const app = express()
  app.disable('x-powered-by')
  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }))
  app.use(express.raw({ type: '*/*', limit: '1mb' }))
  app.use(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://assessment.local')
      const body = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : ''
      const timestamp = request.headers['x-request-timestamp']
      const nonce = request.headers['x-request-nonce']
      const signature = request.headers['x-signature']
      const verified = verifyRequest({
        method: request.method,
        path: url.pathname,
        timestamp,
        nonce,
        body
      }, signature, secret)
      if (!verified) return response.status(401).json({ error: 'INVALID_SIGNATURE' })
      if (!replayGuard.consume(nonce)) return response.status(409).json({ error: 'REPLAYED_NONCE' })

      if (request.method === 'GET' && url.pathname === '/internal/metrics') {
        return response.status(200).json(effectiveTelemetry.snapshot())
      }

      if (request.method === 'POST' && url.pathname === '/v1/assessments') {
        if (!assessmentEnabled) return response.status(503).json({ error: 'ASSESSMENT_PROVIDER_NOT_ENABLED' })
        const task = await effectiveOrchestrator.accept(JSON.parse(body))
        const processed = await effectiveOrchestrator.process(task.taskId)
        return response.status(202).json({
          taskId: processed.taskId,
          status: processed.status,
          progressStage: processed.progressStage
        })
      }
      if (request.method === 'POST' && url.pathname === '/internal/v1/assessments:run') {
        if (!assessmentEnabled) return response.status(503).json({ error: 'ASSESSMENT_PROVIDER_NOT_ENABLED' })
        const task = await effectiveOrchestrator.accept(JSON.parse(body))
        return response.status(200).json(await effectiveOrchestrator.process(task.taskId))
      }
      const match = url.pathname.match(/^\/v1\/assessments\/([^/]+)(\/cancel)?$/)
      if (match && request.method === 'GET' && !match[2]) {
        const task = await effectiveOrchestrator.repository.get(match[1])
        return task ? response.status(200).json(task) : response.status(404).json({ error: 'TASK_NOT_FOUND' })
      }
      if (match && request.method === 'POST' && match[2] === '/cancel') {
        return response.status(200).json(await effectiveOrchestrator.cancel(match[1]))
      }
      return response.status(404).json({ error: 'NOT_FOUND' })
    } catch (error) {
      return response.status(400).json({ error: error.message })
    }
  })
  app.use((error, _request, response, _next) => {
    const status = error?.type === 'entity.too.large' ? 413 : 400
    response.status(status).json({ error: status === 413 ? 'REQUEST_BODY_TOO_LARGE' : 'INVALID_REQUEST_BODY' })
  })
  return app
}

export function createAssessmentServer(options = {}) {
  return createHttpServer(createAssessmentApp(options))
}

export function assertProductionSecrets(values) {
  const entries = Object.entries(values)
  for (const [name, value] of entries) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < 32) {
      throw new Error(`${name}_MINIMUM_32_BYTES_REQUIRED`)
    }
  }
  if (new Set(entries.map(([, value]) => value)).size !== entries.length) {
    throw new Error('PRODUCTION_SECRETS_MUST_BE_DISTINCT')
  }
}

async function main() {
  const providerMode = process.env.ASSESSMENT_PROVIDER_MODE
  if (!['fixture', 'synthetic-pipeline', 'font-smoke'].includes(providerMode)) {
    throw new Error('Only approved synthetic providers are enabled; POC gate blocks real providers')
  }
  if (process.env.NODE_ENV === 'production' && providerMode !== 'font-smoke') {
    throw new Error('SYNTHETIC_PROVIDER_FORBIDDEN_IN_PRODUCTION')
  }
  const secret = process.env.BFF_HMAC_SECRET
  if (!secret) throw new Error('BFF_HMAC_SECRET_REQUIRED')
  const taskHashSecret = process.env.TELEMETRY_HASH_SECRET
  if (process.env.NODE_ENV === 'production' && !taskHashSecret) {
    throw new Error('TELEMETRY_HASH_SECRET_REQUIRED')
  }
  if (process.env.NODE_ENV === 'production') {
    assertProductionSecrets({ BFF_HMAC_SECRET: secret, TELEMETRY_HASH_SECRET: taskHashSecret })
  }
  const port = Number(process.env.PORT ?? 8080)
  const telemetry = new SafeTelemetry({ taskHashSecret: taskHashSecret ?? 'local-test-telemetry-secret' })
  let orchestrator
  let assessmentEnabled = true
  if (providerMode === 'font-smoke') {
    if (process.env.GLYPH_PROVIDER_MODE !== 'source-han-serif') {
      throw new Error('LICENSED_GLYPH_PROVIDER_REQUIRED')
    }
    await SourceHanSerifGlyphProvider.create()
    assessmentEnabled = false
  }
  if (providerMode === 'fixture') {
    const { FixtureAssessmentProvider } = await import('./providers/fixture-provider.mjs')
    orchestrator = new AssessmentOrchestrator({
      repository: new MemoryAssessmentRepository(),
      provider: new FixtureAssessmentProvider({ enabled: true }),
      telemetry
    })
  }
  if (providerMode === 'synthetic-pipeline') {
    const glyphProvider = process.env.GLYPH_PROVIDER_MODE === 'source-han-serif'
      ? await SourceHanSerifGlyphProvider.create()
      : undefined
    const { provider } = await createApprovedSyntheticPipeline({ glyphProvider })
    orchestrator = new AssessmentOrchestrator({
      repository: new MemoryAssessmentRepository(),
      provider,
      telemetry
    })
  }
  const server = createAssessmentServer({ secret, telemetry, orchestrator, assessmentEnabled })
  server.listen(port, '0.0.0.0', () => console.log(`assessment service listening on ${port}`))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
