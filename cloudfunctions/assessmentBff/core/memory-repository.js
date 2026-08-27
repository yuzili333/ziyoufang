const { buildCharacterGrowth } = require('./growth-engine')

class MemoryBffRepository {
  constructor() {
    this.tasks = new Map()
    this.byIdempotency = new Map()
    this.history = new Map()
    this.growth = new Map()
    this.wordbook = new Map()
    this.monitoringEvents = []
    this.consents = new Map()
    this.mediaObjects = new Map()
    this.feedback = new Map()
    this.feedbackByIdempotency = new Map()
    this.shareCards = new Map()
    this.shareByIdempotency = new Map()
    this.shareByTokenHash = new Map()
    this.auditEvents = []
    this.deletionJobs = new Map()
    this.deletionByRequest = new Map()
  }

  key(subjectId, idempotencyKey) {
    return `${subjectId}:${idempotencyKey}`
  }

  async findByIdempotency(subjectId, idempotencyKey) {
    const taskId = this.byIdempotency.get(this.key(subjectId, idempotencyKey))
    return taskId ? this.getTask(taskId) : null
  }

  async createTask(task) {
    const existing = await this.findByIdempotency(task.subjectId, task.idempotencyKey)
    if (existing) return existing
    this.tasks.set(task.taskId, structuredClone(task))
    this.byIdempotency.set(this.key(task.subjectId, task.idempotencyKey), task.taskId)
    return structuredClone(task)
  }

  async getTask(taskId) {
    const task = this.tasks.get(taskId)
    return task ? structuredClone(task) : null
  }

  async updateTask(taskId, patch) {
    const current = this.tasks.get(taskId)
    if (!current) throw new Error('TASK_NOT_FOUND')
    const next = { ...current, ...structuredClone(patch) }
    this.tasks.set(taskId, next)
    return structuredClone(next)
  }

  async saveResult(taskId, result) {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error('TASK_NOT_FOUND')
    const enrichedResult = structuredClone(result)
    for (const character of enrichedResult.characters ?? []) {
      if (!character.expectedCharacter) continue
      const key = `${task.subjectId}:${character.expectedCharacter}`
      const points = this.history.get(key) ?? []
      const practiceId = `${taskId}:${character.index}`
      if (!points.some((point) => point.practiceId === practiceId)) {
        points.push({
          practiceId,
          taskId,
          resultVersion: result.resultVersion,
          assessedAt: result.updatedAt,
          totalScore: character.score,
          taskStatus: result.status,
          category: character.category,
          scoreVersion: character.versions?.score,
          glyphVersion: character.versions?.glyph,
          dimensions: character.scoreBreakdown
        })
        this.history.set(key, points)
      }
      const previousEntry = this.wordbook.get(key) ?? null
      const growth = buildCharacterGrowth({
        studentCharacterId: key,
        character: character.expectedCharacter,
        points,
        previousMonitoring: previousEntry ? {
          status: previousEntry.monitoringStatus,
          reasonCodes: previousEntry.monitoringReasonCodes,
          enteredAt: previousEntry.monitoringEnteredAt
        } : null,
        now: result.updatedAt
      })
      this.growth.set(key, growth)
      character.scoreBreakdown.stability = growth.stabilityScore
      character.growthSummary = {
        status: growth.status,
        comparablePracticeCount: growth.comparablePracticeCount,
        requiredPracticeCount: growth.requiredPracticeCount,
        recentAverage: growth.recentAverage,
        stabilityScore: growth.stabilityScore,
        monitoringStatus: growth.monitoring.status,
        monitoringReasonCodes: growth.monitoring.reasonCodes
      }

      const isProblem = ['wrong', 'needs_correction'].includes(character.category)
      if (isProblem || previousEntry) {
        const entry = {
          wordbookEntryId: key,
          subjectId: task.subjectId,
          targetCharacter: character.expectedCharacter,
          latestTaskId: taskId,
          latestResultVersion: result.resultVersion,
          currentCategory: character.category,
          latestScore: character.score,
          practiceCount: points.length,
          monitoringStatus: growth.monitoring.status,
          monitoringReasonCodes: growth.monitoring.reasonCodes,
          monitoringEnteredAt: growth.monitoring.enteredAt,
          monitoringExitedAt: growth.monitoring.exitedAt,
          recentAverage: growth.recentAverage,
          stabilityScore: growth.stabilityScore,
          requiredPracticeCount: growth.requiredPracticeCount,
          updatedAt: result.updatedAt
        }
        this.wordbook.set(key, entry)
        if (previousEntry?.monitoringStatus !== entry.monitoringStatus
          && ['monitoring', 'recovered'].includes(entry.monitoringStatus)) {
          this.monitoringEvents.push({
            subjectId: task.subjectId,
            targetCharacter: character.expectedCharacter,
            eventType: entry.monitoringStatus === 'monitoring' ? 'entered' : 'exited',
            reasonCodes: entry.monitoringReasonCodes,
            thresholdVersion: growth.monitoring.ruleVersion,
            occurredAt: result.updatedAt
          })
        }
      }
    }
    return this.updateTask(taskId, enrichedResult)
  }

  async getWordbookEntries(subjectId, filter = 'all') {
    return [...this.wordbook.values()]
      .filter((entry) => entry.subjectId === subjectId)
      .filter((entry) => filter === 'monitoring'
        ? entry.monitoringStatus === 'monitoring'
        : filter === 'wrong'
          ? entry.currentCategory === 'wrong'
          : filter === 'correction'
            ? entry.currentCategory === 'needs_correction'
            : true)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((entry) => structuredClone(entry))
  }

  async getCharacterGrowth(subjectId, character) {
    const value = this.growth.get(`${subjectId}:${character}`)
    return value ? structuredClone(value) : null
  }

  async recordConsent(record) {
    const records = this.consents.get(record.subjectId) ?? []
    records.push(structuredClone(record))
    this.consents.set(record.subjectId, records)
    return structuredClone(record)
  }

  async getConsentStatus(subjectId, purpose) {
    const records = this.consents.get(subjectId) ?? []
    return structuredClone([...records].reverse().find((record) => record.purpose === purpose) ?? null)
  }

  async getActiveConsent(subjectId, purpose, consentVersion) {
    const latest = await this.getConsentStatus(subjectId, purpose)
    return latest?.decision === 'granted' && latest.consentVersion === consentVersion ? latest : null
  }

  async upsertMediaObject(media) {
    const existing = this.mediaObjects.get(media.mediaId)
    const next = { ...(existing ?? {}), ...structuredClone(media) }
    this.mediaObjects.set(media.mediaId, next)
    return structuredClone(next)
  }

  async findFeedbackByIdempotency(subjectId, key) {
    const id = this.feedbackByIdempotency.get(`${subjectId}:${key}`)
    const value = id ? this.feedback.get(id) : null
    return value ? structuredClone(value) : null
  }

  async createFeedback(record) {
    const existing = await this.findFeedbackByIdempotency(record.subjectId, record.feedbackIdempotencyKey)
    if (existing) return existing
    this.feedback.set(record.feedbackId, structuredClone(record))
    this.feedbackByIdempotency.set(
      `${record.subjectId}:${record.feedbackIdempotencyKey}`,
      record.feedbackId
    )
    return structuredClone(record)
  }

  async getFeedbackRecords(subjectId) {
    return [...this.feedback.values()]
      .filter((record) => record.subjectId === subjectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => structuredClone(record))
  }

  async findShareByIdempotency(subjectId, key) {
    const id = this.shareByIdempotency.get(`${subjectId}:${key}`)
    const value = id ? this.shareCards.get(id) : null
    return value ? structuredClone(value) : null
  }

  async createShareCard(card) {
    const existing = await this.findShareByIdempotency(card.subjectId, card.shareIdempotencyKey)
    if (existing) return existing
    this.shareCards.set(card.shareCardId, structuredClone(card))
    this.shareByIdempotency.set(`${card.subjectId}:${card.shareIdempotencyKey}`, card.shareCardId)
    this.shareByTokenHash.set(card.shareTokenHash, card.shareCardId)
    return structuredClone(card)
  }

  async getShareCard(shareCardId) {
    const value = this.shareCards.get(shareCardId)
    return value ? structuredClone(value) : null
  }

  async getShareCardByTokenHash(tokenHash) {
    const id = this.shareByTokenHash.get(tokenHash)
    return id ? this.getShareCard(id) : null
  }

  async updateShareCard(shareCardId, patch) {
    const current = this.shareCards.get(shareCardId)
    if (!current) throw new Error('SHARE_CARD_NOT_FOUND')
    const next = { ...current, ...structuredClone(patch) }
    this.shareCards.set(shareCardId, next)
    return structuredClone(next)
  }

  async appendAuditEvent(event) {
    this.auditEvents.push(structuredClone(event))
    return structuredClone(event)
  }

  async findDeletionByRequest(subjectId, requestId) {
    const id = this.deletionByRequest.get(`${subjectId}:${requestId}`)
    const value = id ? this.deletionJobs.get(id) : null
    return value ? structuredClone(value) : null
  }

  async createDeletionJob(job) {
    const existing = await this.findDeletionByRequest(job.subjectId, job.requestId)
    if (existing) return existing
    this.deletionJobs.set(job.deletionJobId, structuredClone(job))
    this.deletionByRequest.set(`${job.subjectId}:${job.requestId}`, job.deletionJobId)
    return structuredClone(job)
  }

  async updateDeletionJob(deletionJobId, patch) {
    const current = this.deletionJobs.get(deletionJobId)
    if (!current) throw new Error('DELETION_JOB_NOT_FOUND')
    const next = { ...current, ...structuredClone(patch) }
    this.deletionJobs.set(deletionJobId, next)
    return structuredClone(next)
  }

  async getDeletionJobs(subjectId) {
    return [...this.deletionJobs.values()]
      .filter((job) => job.subjectId === subjectId)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .map((job) => structuredClone(job))
  }

  async deletePracticeData(subjectId, rootTaskId, deletedAt) {
    const taskIds = new Set([rootTaskId])
    let expanded = true
    while (expanded) {
      expanded = false
      for (const task of this.tasks.values()) {
        if (task.subjectId === subjectId && task.reassessmentOfTaskId && taskIds.has(task.reassessmentOfTaskId)
          && !taskIds.has(task.taskId)) {
          taskIds.add(task.taskId)
          expanded = true
        }
      }
    }
    const affectedCharacters = new Set()
    let characterResults = 0
    let mediaObjects = 0
    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId)
      for (const character of task?.characters ?? []) affectedCharacters.add(character.expectedCharacter)
      characterResults += task?.characters?.length ?? 0
      if (task) this.byIdempotency.delete(this.key(subjectId, task.idempotencyKey))
      this.tasks.delete(taskId)
    }
    for (const [mediaId, media] of this.mediaObjects) {
      if (media.subjectId === subjectId && taskIds.has(media.sourceTaskId)) {
        this.mediaObjects.delete(mediaId)
        mediaObjects += 1
      }
    }
    for (const character of affectedCharacters) {
      const key = `${subjectId}:${character}`
      const remaining = (this.history.get(key) ?? []).filter((point) => !taskIds.has(point.taskId))
      if (remaining.length === 0) {
        this.history.delete(key)
        this.growth.delete(key)
        this.wordbook.delete(key)
        continue
      }
      this.history.set(key, remaining)
      const previous = this.wordbook.get(key)
      const growth = buildCharacterGrowth({
        studentCharacterId: key,
        character,
        points: remaining,
        previousMonitoring: previous ? {
          status: previous.monitoringStatus,
          reasonCodes: previous.monitoringReasonCodes,
          enteredAt: previous.monitoringEnteredAt
        } : null,
        now: deletedAt
      })
      this.growth.set(key, growth)
      const hasProblem = remaining.some((point) => ['wrong', 'needs_correction'].includes(point.category))
      const latest = remaining[remaining.length - 1]
      if (!hasProblem || !latest) {
        this.wordbook.delete(key)
      } else if (previous) {
        this.wordbook.set(key, {
          ...previous,
          latestTaskId: latest.taskId,
          latestResultVersion: latest.resultVersion,
          currentCategory: latest.category,
          latestScore: latest.totalScore,
          practiceCount: remaining.length,
          monitoringStatus: growth.monitoring.status,
          monitoringReasonCodes: growth.monitoring.reasonCodes,
          recentAverage: growth.recentAverage,
          stabilityScore: growth.stabilityScore,
          requiredPracticeCount: growth.requiredPracticeCount,
          updatedAt: deletedAt
        })
      }
    }
    let feedbackRecords = 0
    for (const [feedbackId, record] of this.feedback) {
      if (record.subjectId === subjectId
        && (taskIds.has(record.originalTaskId) || taskIds.has(record.reassessmentTaskId))) {
        this.feedback.delete(feedbackId)
        this.feedbackByIdempotency.delete(`${subjectId}:${record.feedbackIdempotencyKey}`)
        feedbackRecords += 1
      }
    }
    let shareCards = 0
    for (const [shareCardId, card] of this.shareCards) {
      if (card.subjectId === subjectId && taskIds.has(card.sourceTaskId)) {
        this.shareCards.delete(shareCardId)
        this.shareByIdempotency.delete(`${subjectId}:${card.shareIdempotencyKey}`)
        this.shareByTokenHash.delete(card.shareTokenHash)
        shareCards += 1
      }
    }
    return {
      taskIds: [...taskIds],
      counts: {
        assessmentTasks: taskIds.size,
        mediaObjects,
        characterResults,
        feedbackRecords,
        shareCards,
        affectedCharacters: affectedCharacters.size
      }
    }
  }
}

module.exports = { MemoryBffRepository }
