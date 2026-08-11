import { createHmac } from 'node:crypto'

const EVENT_TYPES = new Set([
  'assessment_accepted',
  'provider_call',
  'assessment_completed',
  'assessment_failed',
  'assessment_cancelled'
])

const ALLOWED_FIELDS = new Set([
  'taskId', 'stage', 'status', 'errorCode', 'provider', 'operation', 'latencyMs',
  'costMicros', 'inputUnits', 'outputUnits', 'cacheHit', 'characterCount'
])

const SENSITIVE_KEY = /(image|photo|path|prompt|secret|token|openid|session|expectedText|advice|characterResult)/i

const percentile = (values, ratio) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)]
}

export const safeErrorCode = (error) => {
  const candidate = String(error?.code ?? error?.message ?? 'INTERNAL_ERROR')
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(candidate) ? candidate : 'INTERNAL_ERROR'
}

export class SafeTelemetry {
  constructor({
    taskHashSecret = 'local-test-telemetry-secret',
    now = () => new Date().toISOString(),
    maximumEvents = 10_000
  } = {}) {
    if (!taskHashSecret) throw new Error('TELEMETRY_HASH_SECRET_REQUIRED')
    this.taskHashSecret = taskHashSecret
    this.now = now
    this.maximumEvents = maximumEvents
    this.events = []
  }

  taskHash(taskId) {
    return createHmac('sha256', this.taskHashSecret).update(String(taskId)).digest('hex')
  }

  emit(eventType, fields = {}) {
    if (!EVENT_TYPES.has(eventType)) throw new Error('TELEMETRY_EVENT_TYPE_INVALID')
    for (const key of Object.keys(fields)) {
      if (SENSITIVE_KEY.test(key)) throw new Error('TELEMETRY_SENSITIVE_FIELD_REJECTED')
      if (!ALLOWED_FIELDS.has(key)) throw new Error('TELEMETRY_FIELD_NOT_ALLOWED')
    }
    const event = { eventType, occurredAt: this.now() }
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'taskId') event.taskHash = this.taskHash(value)
      else event[key] = value
    }
    this.events.push(Object.freeze(event))
    if (this.events.length > this.maximumEvents) this.events.splice(0, this.events.length - this.maximumEvents)
    return event
  }

  snapshot() {
    const countsByType = {}
    const statusCounts = {}
    const errorCounts = {}
    const providerCostsMicros = {}
    const latencies = []
    let totalCostMicros = 0
    let providerCalls = 0
    let failedProviderCalls = 0
    let cacheHits = 0
    for (const event of this.events) {
      countsByType[event.eventType] = (countsByType[event.eventType] ?? 0) + 1
      if (event.status) statusCounts[event.status] = (statusCounts[event.status] ?? 0) + 1
      if (event.errorCode) errorCounts[event.errorCode] = (errorCounts[event.errorCode] ?? 0) + 1
      if (event.eventType === 'provider_call') {
        providerCalls += 1
        if (event.status === 'failed') failedProviderCalls += 1
        if (Number.isFinite(event.latencyMs)) latencies.push(event.latencyMs)
        if (event.cacheHit) cacheHits += 1
        const cost = Number.isFinite(event.costMicros) ? event.costMicros : 0
        totalCostMicros += cost
        const provider = event.provider ?? 'unknown'
        providerCostsMicros[provider] = (providerCostsMicros[provider] ?? 0) + cost
      }
    }
    return {
      eventCount: this.events.length,
      countsByType,
      statusCounts,
      errorCounts,
      latencyMs: {
        samples: latencies.length,
        p50: percentile(latencies, 0.50),
        p95: percentile(latencies, 0.95)
      },
      cost: {
        providerCalls,
        failedProviderCalls,
        errorRate: providerCalls ? failedProviderCalls / providerCalls : null,
        totalMicros: totalCostMicros,
        averagePerProviderCallMicros: providerCalls ? Math.round(totalCostMicros / providerCalls) : null,
        byProviderMicros: providerCostsMicros,
        cacheHitRate: providerCalls ? cacheHits / providerCalls : null
      }
    }
  }

  readEventsForTesting() {
    return structuredClone(this.events)
  }
}
