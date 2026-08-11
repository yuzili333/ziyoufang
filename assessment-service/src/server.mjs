import { createServer as createHttpServer } from 'node:http'
import { pathToFileURL } from 'node:url'

import { AssessmentOrchestrator } from './orchestrator.mjs'
import { createApprovedSyntheticPipeline } from './pipeline/approved-synthetic-pipeline.mjs'
import { FixtureAssessmentProvider } from './providers/fixture-provider.mjs'
import { MemoryAssessmentRepository } from './repository.mjs'
import { NonceReplayGuard, verifyRequest } from './security.mjs'
import { SafeTelemetry } from './telemetry.mjs'

const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

const readBody = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

export function createAssessmentServer({
  secret,
  replayGuard = new NonceReplayGuard(),
  telemetry = new SafeTelemetry(),
  orchestrator
} = {}) {
  const effectiveOrchestrator = orchestrator ?? new AssessmentOrchestrator({
    repository: new MemoryAssessmentRepository(),
    provider: new FixtureAssessmentProvider({ enabled: true }),
    telemetry
  })
  const effectiveTelemetry = effectiveOrchestrator.telemetry ?? telemetry
  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://assessment.local')
      const body = await readBody(request)
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
      if (!verified) return json(response, 401, { error: 'INVALID_SIGNATURE' })
      if (!replayGuard.consume(nonce)) return json(response, 409, { error: 'REPLAYED_NONCE' })

      if (request.method === 'GET' && url.pathname === '/internal/metrics') {
        return json(response, 200, effectiveTelemetry.snapshot())
      }

      if (request.method === 'POST' && url.pathname === '/v1/assessments') {
        const task = await effectiveOrchestrator.accept(JSON.parse(body))
        queueMicrotask(() => effectiveOrchestrator.process(task.taskId).catch(() => undefined))
        return json(response, 202, {
          taskId: task.taskId,
          status: task.status,
          progressStage: task.progressStage
        })
      }
      const match = url.pathname.match(/^\/v1\/assessments\/([^/]+)(\/cancel)?$/)
      if (match && request.method === 'GET' && !match[2]) {
        const task = await effectiveOrchestrator.repository.get(match[1])
        return task ? json(response, 200, task) : json(response, 404, { error: 'TASK_NOT_FOUND' })
      }
      if (match && request.method === 'POST' && match[2] === '/cancel') {
        return json(response, 200, await effectiveOrchestrator.cancel(match[1]))
      }
      return json(response, 404, { error: 'NOT_FOUND' })
    } catch (error) {
      return json(response, 400, { error: error.message })
    }
  })
}

async function main() {
  const providerMode = process.env.ASSESSMENT_PROVIDER_MODE
  if (!['fixture', 'synthetic-pipeline'].includes(providerMode)) {
    throw new Error('Only approved synthetic providers are enabled; POC gate blocks real providers')
  }
  if (process.env.NODE_ENV === 'production') throw new Error('SYNTHETIC_PROVIDER_FORBIDDEN_IN_PRODUCTION')
  const secret = process.env.BFF_HMAC_SECRET
  if (!secret) throw new Error('BFF_HMAC_SECRET_REQUIRED')
  const taskHashSecret = process.env.TELEMETRY_HASH_SECRET
  if (process.env.NODE_ENV === 'production' && !taskHashSecret) {
    throw new Error('TELEMETRY_HASH_SECRET_REQUIRED')
  }
  const port = Number(process.env.PORT ?? 8787)
  const telemetry = new SafeTelemetry({ taskHashSecret: taskHashSecret ?? 'local-test-telemetry-secret' })
  let orchestrator
  if (providerMode === 'synthetic-pipeline') {
    const { provider } = await createApprovedSyntheticPipeline()
    orchestrator = new AssessmentOrchestrator({
      repository: new MemoryAssessmentRepository(),
      provider,
      telemetry
    })
  }
  const server = createAssessmentServer({ secret, telemetry, orchestrator })
  server.listen(port, '127.0.0.1', () => console.log(`assessment service listening on ${port}`))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
