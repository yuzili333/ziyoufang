import { SafeTelemetry, safeErrorCode } from './telemetry.mjs'

const cancellationError = () => {
  const error = new Error('TASK_CANCELLED')
  error.code = 'TASK_CANCELLED'
  error.retryable = false
  return error
}

export class AssessmentOrchestrator {
  #mediaAccessByTask = new Map()

  constructor({
    repository,
    provider,
    telemetry = new SafeTelemetry(),
    now = () => new Date().toISOString(),
    clock = () => Date.now()
  }) {
    this.repository = repository
    this.provider = provider
    this.telemetry = telemetry
    this.now = now
    this.clock = clock
  }

  async accept(input) {
    for (const field of ['taskId', 'localTaskId', 'idempotencyKey', 'subjectId', 'imageSha256', 'expectedText']) {
      if (!input[field]) throw new Error(`INVALID_${field.toUpperCase()}`)
    }
    const { mediaAccess } = input
    const persistableInput = {
      taskId: input.taskId,
      localTaskId: input.localTaskId,
      idempotencyKey: input.idempotencyKey,
      subjectId: input.subjectId,
      imageSha256: input.imageSha256,
      expectedText: input.expectedText,
      resultVersion: input.resultVersion,
      reassessmentOfTaskId: input.reassessmentOfTaskId,
      reassessmentReason: input.reassessmentReason
    }
    if (mediaAccess !== undefined) {
      let url
      try {
        url = new URL(mediaAccess?.url)
      } catch {
        throw new Error('MEDIA_ACCESS_INVALID')
      }
      const expiresAt = Date.parse(mediaAccess?.expiresAt)
      const nowMs = Date.parse(this.now())
      if (url.protocol !== 'https:' || url.username || url.password
        || !Number.isFinite(expiresAt) || expiresAt <= nowMs || expiresAt > nowMs + 20 * 60 * 1000) {
        throw new Error('MEDIA_ACCESS_INVALID')
      }
      this.#mediaAccessByTask.set(input.taskId, Object.freeze({
        url: url.toString(),
        expiresAt: new Date(expiresAt).toISOString()
      }))
    }
    const existing = await this.repository.get(input.taskId)
    if (existing) return existing
    const task = await this.repository.create({
      ...persistableInput,
      status: 'analyzing',
      progressStage: 'quality_checking',
      resultVersion: input.resultVersion ?? 1,
      acceptedAt: this.now(),
      updatedAt: this.now()
    })
    this.telemetry.emit('assessment_accepted', {
      taskId: task.taskId,
      status: task.status,
      stage: task.progressStage,
      characterCount: [...task.expectedText].length
    })
    return task
  }

  async process(taskId) {
    const task = await this.repository.get(taskId)
    if (!task) throw new Error('TASK_NOT_FOUND')
    if (['completed', 'partially_completed', 'cancelled'].includes(task.status)) {
      this.#mediaAccessByTask.delete(taskId)
      return task
    }
    const startedAt = this.clock()
    try {
      const mediaAccess = this.#mediaAccessByTask.get(taskId)
      const response = await this.provider.assess(mediaAccess ? { ...task, mediaAccess } : task, {
        onProgress: async (progressStage) => {
          const current = await this.repository.get(taskId)
          if (current?.status === 'cancelled') throw cancellationError()
          await this.repository.update(taskId, { progressStage, updatedAt: this.now() })
        }
      })
      const result = response?.result ?? response
      const usage = response?.usage ?? {}
      const latencyMs = Math.max(0, this.clock() - startedAt)
      const current = await this.repository.get(taskId)
      if (current?.status === 'cancelled') {
        this.telemetry.emit('provider_call', {
          taskId,
          provider: usage.provider ?? this.provider.name ?? 'unknown',
          operation: usage.operation ?? 'assessment',
          latencyMs,
          costMicros: usage.costMicros ?? 0,
          inputUnits: usage.inputUnits ?? 0,
          outputUnits: usage.outputUnits ?? 0,
          cacheHit: usage.cacheHit ?? false,
          status: 'cancelled'
        })
        return current
      }
      this.telemetry.emit('provider_call', {
        taskId,
        provider: usage.provider ?? this.provider.name ?? 'unknown',
        operation: usage.operation ?? 'assessment',
        latencyMs,
        costMicros: usage.costMicros ?? 0,
        inputUnits: usage.inputUnits ?? 0,
        outputUnits: usage.outputUnits ?? 0,
        cacheHit: usage.cacheHit ?? false,
        status: 'success'
      })
      const saved = await this.repository.update(taskId, { ...result, updatedAt: this.now() })
      this.telemetry.emit('assessment_completed', {
        taskId,
        status: saved.status,
        stage: saved.progressStage,
        latencyMs
      })
      return saved
    } catch (error) {
      const latencyMs = Math.max(0, this.clock() - startedAt)
      const errorCode = safeErrorCode(error)
      if (errorCode === 'TASK_CANCELLED') {
        const cancelled = await this.repository.get(taskId)
        this.telemetry.emit('provider_call', {
          taskId,
          provider: this.provider.name ?? 'unknown',
          operation: 'assessment',
          latencyMs,
          costMicros: 0,
          inputUnits: 0,
          outputUnits: 0,
          cacheHit: false,
          status: 'cancelled'
        })
        return cancelled
      }
      this.telemetry.emit('provider_call', {
        taskId,
        provider: this.provider.name ?? 'unknown',
        operation: 'assessment',
        latencyMs,
        costMicros: 0,
        inputUnits: 0,
        outputUnits: 0,
        cacheHit: false,
        status: 'failed',
        errorCode
      })
      const failed = await this.repository.update(taskId, {
        status: 'failed',
        progressStage: 'finished',
        retryable: typeof error?.retryable === 'boolean' ? error.retryable : true,
        errorCode,
        updatedAt: this.now()
      })
      this.telemetry.emit('assessment_failed', {
        taskId,
        status: failed.status,
        stage: failed.progressStage,
        errorCode,
        latencyMs
      })
      return failed
    } finally {
      this.#mediaAccessByTask.delete(taskId)
    }
  }

  async cancel(taskId) {
    const task = await this.repository.get(taskId)
    if (!task) throw new Error('TASK_NOT_FOUND')
    if (task.progressStage === 'persisting_result' || ['completed', 'partially_completed'].includes(task.status)) {
      this.#mediaAccessByTask.delete(taskId)
      return task
    }
    const cancelled = await this.repository.update(taskId, {
      status: 'cancelled',
      progressStage: 'finished',
      updatedAt: this.now()
    })
    this.#mediaAccessByTask.delete(taskId)
    this.telemetry.emit('assessment_cancelled', {
      taskId,
      status: cancelled.status,
      stage: cancelled.progressStage
    })
    return cancelled
  }
}
