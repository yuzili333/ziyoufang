const { createHash } = require('node:crypto')
const { buildCharacterGrowth } = require('../../cloudfunctions/assessmentBff/core/growth-engine')

const documentId = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 48)

class MySqlBffRepository {
  constructor({ pool, store }) { this.pool = pool; this.store = store }

  async transaction(callback) {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const result = await callback(connection)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback()
      throw error
    } finally { connection.release() }
  }

  async upsertSubjectAccount(account) {
    const existing = await this.store.get('subject_accounts', account.subjectId)
    return this.store.put('subject_accounts', {
      ...account, _id: account.subjectId, createdAt: existing?.createdAt ?? account.createdAt
    })
  }

  async findByIdempotency(subjectId, idempotencyKey, connection = this.pool) {
    return (await this.store.find('assessment_tasks', { subjectId, idempotencyKey }, connection, { limit: 1 }))[0] ?? null
  }

  async createTask(task) {
    return this.transaction(async (connection) => {
      const existing = await this.findByIdempotency(task.subjectId, task.idempotencyKey, connection)
      if (existing) return existing
      return this.store.put('assessment_tasks', { ...task, _id: task.taskId }, connection)
    }).catch(async (error) => {
      if (error?.code !== 'ER_DUP_ENTRY') throw error
      return this.findByIdempotency(task.subjectId, task.idempotencyKey)
    })
  }

  async getTask(taskId, connection = this.pool) {
    const task = await this.store.get('assessment_tasks', taskId, connection)
    if (!task) return null
    if (['completed', 'partially_completed'].includes(task.status)) {
      task.characters = (await this.store.find('character_results', { taskId }, connection, { order: 'ASC' }))
        .filter((row) => row.resultVersion === task.resultVersion)
        .sort((a, b) => (a.characterIndex ?? a.index) - (b.characterIndex ?? b.index))
    }
    return task
  }

  async updateTask(taskId, patch) {
    return this.transaction(async (connection) => {
      const current = await this.store.get('assessment_tasks', taskId, connection, { forUpdate: true })
      if (!current) throw new Error('TASK_NOT_FOUND')
      await this.store.put('assessment_tasks', { ...current, ...patch, _id: taskId }, connection)
      return this.getTask(taskId, connection)
    })
  }

  async acceptSubmission({ taskId, taskPatch, mediaObject, assessmentTask, enqueue }) {
    return this.transaction(async (connection) => {
      const current = await this.store.get('assessment_tasks', taskId, connection, { forUpdate: true })
      if (!current) throw new Error('TASK_NOT_FOUND')
      if (current.submittedAt) return this.getTask(taskId, connection)
      if (current.subjectId !== mediaObject.subjectId || current.taskId !== assessmentTask.taskId) {
        throw new Error('SUBMISSION_OWNERSHIP_MISMATCH')
      }
      const analyzing = { ...current, ...taskPatch, _id: taskId }
      await this.store.put('assessment_tasks', analyzing, connection)
      await this.store.put('media_objects', { ...mediaObject, _id: mediaObject.mediaId }, connection)
      await enqueue(assessmentTask, connection)
      return this.getTask(taskId, connection)
    })
  }

  async saveResult(taskId, result) {
    return this.transaction(async (connection) => {
      const task = await this.store.get('assessment_tasks', taskId, connection, { forUpdate: true })
      if (!task) throw new Error('TASK_NOT_FOUND')
      const enriched = structuredClone(result)
      for (const character of enriched.characters ?? []) {
        const resultId = `${taskId}:${result.resultVersion}:${character.index}`
        const row = {
          ...character, _id: resultId, characterResultId: resultId,
          characterIndex: character.index, subjectId: task.subjectId, taskId,
          resultVersion: result.resultVersion, taskStatus: result.status,
          assessedAt: result.updatedAt, createdAt: result.updatedAt
        }
        await this.store.put('character_results', row, connection)
        if (!character.expectedCharacter) continue
        const history = (await this.store.find('character_results', {
          subjectId: task.subjectId, lookupKey: character.expectedCharacter
        }, connection, { order: 'ASC' })).filter((item) => item.expectedCharacter === character.expectedCharacter)
        const points = history.map((item) => ({
          practiceId: `${item.taskId}:${item.characterIndex ?? item.index}`,
          taskId: item.taskId,
          resultVersion: item.resultVersion,
          assessedAt: item.assessedAt ?? item.createdAt,
          totalScore: item.score,
          taskStatus: item.taskStatus,
          category: item.category,
          scoreVersion: item.versions?.score,
          glyphVersion: item.versions?.glyph,
          dimensions: item.scoreBreakdown
        }))
        const wordbookId = documentId(task.subjectId, character.expectedCharacter)
        const previous = await this.store.get('wordbook_entries', wordbookId, connection)
        const growth = buildCharacterGrowth({
          studentCharacterId: wordbookId,
          character: character.expectedCharacter,
          points,
          previousMonitoring: previous ? {
            status: previous.monitoringStatus,
            reasonCodes: previous.monitoringReasonCodes,
            enteredAt: previous.monitoringEnteredAt
          } : null,
          now: result.updatedAt
        })
        row.scoreBreakdown = { ...character.scoreBreakdown, stability: growth.stabilityScore }
        row.growthSummary = {
          status: growth.status,
          comparablePracticeCount: growth.comparablePracticeCount,
          requiredPracticeCount: growth.requiredPracticeCount,
          recentAverage: growth.recentAverage,
          stabilityScore: growth.stabilityScore,
          monitoringStatus: growth.monitoring.status,
          monitoringReasonCodes: growth.monitoring.reasonCodes
        }
        await this.store.put('character_results', row, connection)
        for (const segment of growth.segments) {
          const id = documentId(task.subjectId, character.expectedCharacter, segment.scoreVersion, segment.glyphVersion)
          await this.store.put('growth_segments', {
            _id: id, growthSegmentId: id, subjectId: task.subjectId,
            targetCharacter: character.expectedCharacter,
            scoreVersion: segment.scoreVersion, glyphVersion: segment.glyphVersion,
            comparablePracticeCount: segment.points.length, recentAverage: growth.recentAverage,
            stabilityScore: growth.stabilityScore, points: segment.points,
            growthSnapshot: growth, updatedAt: result.updatedAt
          }, connection)
        }
        if (['wrong', 'needs_correction'].includes(character.category) || previous) {
          const next = {
            _id: wordbookId, wordbookEntryId: wordbookId, subjectId: task.subjectId,
            targetCharacter: character.expectedCharacter, latestTaskId: taskId,
            latestResultVersion: result.resultVersion, currentCategory: character.category,
            latestScore: character.score, practiceCount: points.length,
            monitoringStatus: growth.monitoring.status,
            monitoringReasonCodes: growth.monitoring.reasonCodes,
            monitoringEnteredAt: growth.monitoring.enteredAt,
            monitoringExitedAt: growth.monitoring.exitedAt,
            recentAverage: growth.recentAverage, stabilityScore: growth.stabilityScore,
            requiredPracticeCount: growth.requiredPracticeCount, updatedAt: result.updatedAt
          }
          await this.store.put('wordbook_entries', next, connection)
          if (previous?.monitoringStatus !== next.monitoringStatus
            && ['monitoring', 'recovered'].includes(next.monitoringStatus)) {
            const eventType = next.monitoringStatus === 'monitoring' ? 'entered' : 'exited'
            const id = documentId(task.subjectId, character.expectedCharacter, growth.monitoring.ruleVersion, result.updatedAt, eventType)
            await this.store.put('monitoring_events', {
              _id: id, monitoringEventId: id, subjectId: task.subjectId,
              targetCharacter: character.expectedCharacter, eventType,
              reasonCodes: growth.monitoring.reasonCodes,
              thresholdVersion: growth.monitoring.ruleVersion,
              occurredAt: result.updatedAt
            }, connection)
          }
        }
      }
      await this.store.put('assessment_tasks', {
        ...task,
        status: result.status,
        progressStage: result.progressStage,
        resultVersion: result.resultVersion,
        summary: result.summary,
        updatedAt: result.updatedAt,
        _id: taskId
      }, connection)
      return this.getTask(taskId, connection)
    })
  }

  async getWordbookEntries(subjectId, filter = 'all') {
    return (await this.store.find('wordbook_entries', { subjectId }))
      .filter((entry) => filter === 'monitoring' ? entry.monitoringStatus === 'monitoring'
        : filter === 'wrong' ? entry.currentCategory === 'wrong'
          : filter === 'correction' ? entry.currentCategory === 'needs_correction' : true)
  }

  async getCharacterGrowth(subjectId, character) {
    const row = (await this.store.find('growth_segments', { subjectId, lookupKey: character }, this.pool, { limit: 1 }))[0]
    return row?.growthSnapshot ?? null
  }

  recordConsent(record) { return this.store.put('consent_records', { ...record, _id: record.consentRecordId }) }
  async getConsentStatus(subjectId, purpose) {
    return (await this.store.find('consent_records', { subjectId, lookupKey: purpose }, this.pool, { limit: 1 }))[0] ?? null
  }
  async getActiveConsent(subjectId, purpose, consentVersion) {
    const latest = await this.getConsentStatus(subjectId, purpose)
    return latest?.decision === 'granted' && latest.consentVersion === consentVersion ? latest : null
  }
  upsertMediaObject(media) { return this.store.put('media_objects', { ...media, _id: media.mediaId }) }
  getMediaObject(mediaId) { return this.store.get('media_objects', mediaId) }

  async findFeedbackByIdempotency(subjectId, key) {
    return (await this.store.find('feedback_records', { subjectId, idempotencyKey: key }, this.pool, { limit: 1 }))[0] ?? null
  }
  async createFeedback(record) {
    const existing = await this.findFeedbackByIdempotency(record.subjectId, record.feedbackIdempotencyKey)
    return existing ?? this.store.put('feedback_records', { ...record, _id: record.feedbackId })
  }
  getFeedbackRecords(subjectId) { return this.store.find('feedback_records', { subjectId }) }
  async findShareByIdempotency(subjectId, key) {
    return (await this.store.find('share_cards', { subjectId, idempotencyKey: key }, this.pool, { limit: 1 }))[0] ?? null
  }
  async createShareCard(card) {
    const existing = await this.findShareByIdempotency(card.subjectId, card.shareIdempotencyKey)
    return existing ?? this.store.put('share_cards', { ...card, _id: card.shareCardId })
  }
  getShareCard(id) { return this.store.get('share_cards', id) }
  async getShareCardByTokenHash(tokenHash) {
    return (await this.store.find('share_cards', { lookupKey: tokenHash }, this.pool, { limit: 1 }))[0] ?? null
  }
  updateShareCard(id, patch) { return this.store.patch('share_cards', id, patch) }
  appendAuditEvent(event) { return this.store.put('audit_events', { ...event, _id: event.auditEventId }) }
  async findDeletionByRequest(subjectId, requestId) {
    return (await this.store.find('deletion_jobs', { subjectId, idempotencyKey: requestId }, this.pool, { limit: 1 }))[0] ?? null
  }
  async createDeletionJob(job) {
    const existing = await this.findDeletionByRequest(job.subjectId, job.requestId)
    return existing ?? this.store.put('deletion_jobs', { ...job, _id: job.deletionJobId })
  }
  updateDeletionJob(id, patch) { return this.store.patch('deletion_jobs', id, patch) }
  getDeletionJobs(subjectId) { return this.store.find('deletion_jobs', { subjectId }) }

  async deletePracticeData(subjectId, rootTaskId, deletedAt) {
    return this.transaction(async (connection) => {
      const allTasks = await this.store.find('assessment_tasks', { subjectId }, connection, { order: 'ASC' })
      const taskIds = new Set([rootTaskId])
      let changed = true
      while (changed) {
        changed = false
        for (const task of allTasks) {
          if (task.reassessmentOfTaskId && taskIds.has(task.reassessmentOfTaskId) && !taskIds.has(task.taskId)) {
            taskIds.add(task.taskId); changed = true
          }
        }
      }
      const affected = new Set()
      let characterResults = 0
      let mediaObjects = 0
      let feedbackRecords = 0
      let shareCards = 0
      for (const taskId of taskIds) {
        const characters = await this.store.find('character_results', { subjectId, taskId }, connection)
        for (const row of characters) { affected.add(row.expectedCharacter); await this.store.remove('character_results', row._id, connection) }
        characterResults += characters.length
        const media = await this.store.find('media_objects', { subjectId, taskId }, connection)
        for (const row of media) await this.store.remove('media_objects', row._id, connection)
        mediaObjects += media.length
        for (const row of await this.store.find('feedback_records', { subjectId }, connection)) {
          if (row.originalTaskId === taskId || row.reassessmentTaskId === taskId) {
            feedbackRecords += await this.store.remove('feedback_records', row._id, connection)
          }
        }
        for (const row of await this.store.find('share_cards', { subjectId, taskId }, connection)) {
          shareCards += await this.store.remove('share_cards', row._id, connection)
        }
        await this.store.remove('assessment_tasks', taskId, connection)
      }
      for (const character of affected) {
        for (const table of ['wordbook_entries', 'growth_segments', 'monitoring_events']) {
          const rows = await this.store.find(table, { subjectId, lookupKey: character }, connection)
          for (const row of rows) await this.store.remove(table, row._id, connection)
        }
        const remaining = (await this.store.find('character_results', {
          subjectId, lookupKey: character
        }, connection, { order: 'ASC' })).filter((row) => row.expectedCharacter === character)
        if (remaining.length === 0) continue
        const points = remaining.map((row) => ({
          practiceId: `${row.taskId}:${row.characterIndex ?? row.index}`,
          taskId: row.taskId,
          resultVersion: row.resultVersion,
          assessedAt: row.assessedAt ?? row.createdAt,
          totalScore: row.score,
          taskStatus: row.taskStatus,
          category: row.category,
          scoreVersion: row.versions?.score,
          glyphVersion: row.versions?.glyph,
          dimensions: row.scoreBreakdown
        }))
        const wordbookId = documentId(subjectId, character)
        const growth = buildCharacterGrowth({
          studentCharacterId: wordbookId,
          character,
          points,
          now: deletedAt
        })
        for (const segment of growth.segments) {
          const id = documentId(subjectId, character, segment.scoreVersion, segment.glyphVersion)
          await this.store.put('growth_segments', {
            _id: id,
            growthSegmentId: id,
            subjectId,
            targetCharacter: character,
            scoreVersion: segment.scoreVersion,
            glyphVersion: segment.glyphVersion,
            comparablePracticeCount: segment.points.length,
            recentAverage: growth.recentAverage,
            stabilityScore: growth.stabilityScore,
            points: segment.points,
            growthSnapshot: growth,
            updatedAt: deletedAt
          }, connection)
        }
        const latest = points[points.length - 1]
        if (latest && points.some((point) => ['wrong', 'needs_correction'].includes(point.category))) {
          await this.store.put('wordbook_entries', {
            _id: wordbookId,
            wordbookEntryId: wordbookId,
            subjectId,
            targetCharacter: character,
            latestTaskId: latest.taskId,
            latestResultVersion: latest.resultVersion,
            currentCategory: latest.category,
            latestScore: latest.totalScore,
            practiceCount: points.length,
            monitoringStatus: growth.monitoring.status,
            monitoringReasonCodes: growth.monitoring.reasonCodes,
            monitoringEnteredAt: growth.monitoring.enteredAt,
            monitoringExitedAt: growth.monitoring.exitedAt,
            recentAverage: growth.recentAverage,
            stabilityScore: growth.stabilityScore,
            requiredPracticeCount: growth.requiredPracticeCount,
            updatedAt: deletedAt
          }, connection)
        }
      }
      return { taskIds: [...taskIds], counts: {
        assessmentTasks: taskIds.size, mediaObjects, characterResults, feedbackRecords,
        shareCards, affectedCharacters: affected.size
      }, deletedAt }
    })
  }
}

module.exports = { MySqlBffRepository, documentId }
