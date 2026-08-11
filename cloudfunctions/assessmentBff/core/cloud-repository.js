const { createHash } = require('node:crypto')
const { buildCharacterGrowth } = require('./growth-engine')

const documentId = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 48)

function createCloudRepository(db) {
  const tasks = db.collection('assessment_tasks')

  return {
    async findByIdempotency(subjectId, idempotencyKey) {
      const result = await tasks.where({ subjectId, idempotencyKey }).limit(1).get()
      return result.data[0] ?? null
    },
    async createTask(task) {
      const existing = await this.findByIdempotency(task.subjectId, task.idempotencyKey)
      if (existing) return existing
      await tasks.doc(task.taskId).set({ data: { ...task, _id: task.taskId } })
      return task
    },
    async getTask(taskId) {
      try {
        const result = await tasks.doc(taskId).get()
        const task = result.data ?? null
        if (!task) return null
        if (['completed', 'partially_completed'].includes(task.status)) {
          const characters = await db.collection('character_results')
            .where({ taskId, resultVersion: task.resultVersion })
            .orderBy('characterIndex', 'asc')
            .get()
          task.characters = characters.data
        }
        return task
      } catch (error) {
        if (String(error.errCode ?? error.message).includes('NOT_FOUND')) return null
        throw error
      }
    },
    async updateTask(taskId, patch) {
      await tasks.doc(taskId).update({ data: patch })
      return this.getTask(taskId)
    },
    async saveResult(taskId, result) {
      await db.runTransaction(async (transaction) => {
        const taskCollection = transaction.collection('assessment_tasks')
        const characterCollection = transaction.collection('character_results')
        const wordbookCollection = transaction.collection('wordbook_entries')
        const growthCollection = transaction.collection('growth_segments')
        const monitoringCollection = transaction.collection('monitoring_events')
        for (const character of result.characters) {
          const resultId = `${taskId}:${result.resultVersion}:${character.index}`
          await characterCollection.doc(resultId).set({
            data: {
              ...character,
              _id: resultId,
              characterResultId: resultId,
              characterIndex: character.index,
              subjectId: result.subjectId,
              taskId,
              resultVersion: result.resultVersion,
              taskStatus: result.status,
              assessedAt: result.updatedAt,
              createdAt: result.updatedAt
            }
          })

          if (!character.expectedCharacter) continue
          const historyResult = await characterCollection.where({
            subjectId: result.subjectId,
            expectedCharacter: character.expectedCharacter
          }).get()
          const points = historyResult.data.map((row) => ({
            practiceId: `${row.taskId}:${row.characterIndex ?? row.index}`,
            assessedAt: row.assessedAt ?? row.createdAt,
            totalScore: row.score,
            taskStatus: row.taskStatus,
            category: row.category,
            scoreVersion: row.versions?.score,
            glyphVersion: row.versions?.glyph,
            dimensions: row.scoreBreakdown
          }))
          const previousResult = await wordbookCollection.where({
            subjectId: result.subjectId,
            targetCharacter: character.expectedCharacter
          }).limit(1).get()
          const previous = previousResult.data[0] ?? null
          const wordbookEntryId = documentId(result.subjectId, character.expectedCharacter)
          const growth = buildCharacterGrowth({
            studentCharacterId: wordbookEntryId,
            character: character.expectedCharacter,
            points,
            previousMonitoring: previous ? {
              status: previous.monitoringStatus,
              reasonCodes: previous.monitoringReasonCodes,
              enteredAt: previous.monitoringEnteredAt
            } : null,
            now: result.updatedAt
          })
          const growthSummary = {
            status: growth.status,
            comparablePracticeCount: growth.comparablePracticeCount,
            requiredPracticeCount: growth.requiredPracticeCount,
            recentAverage: growth.recentAverage,
            stabilityScore: growth.stabilityScore,
            monitoringStatus: growth.monitoring.status,
            monitoringReasonCodes: growth.monitoring.reasonCodes
          }
          await characterCollection.doc(resultId).update({
            data: {
              growthSummary,
              scoreBreakdown: { ...character.scoreBreakdown, stability: growth.stabilityScore }
            }
          })
          for (const segment of growth.segments) {
            const growthSegmentId = documentId(
              result.subjectId, character.expectedCharacter, segment.scoreVersion, segment.glyphVersion
            )
            await growthCollection.doc(growthSegmentId).set({
              data: {
                _id: growthSegmentId,
                growthSegmentId,
                subjectId: result.subjectId,
                targetCharacter: character.expectedCharacter,
                scoreVersion: segment.scoreVersion,
                glyphVersion: segment.glyphVersion,
                comparablePracticeCount: segment.points.length,
                recentAverage: growth.recentAverage,
                stabilityScore: growth.stabilityScore,
                points: segment.points,
                growthSnapshot: growth,
                updatedAt: result.updatedAt
              }
            })
          }
          const isProblem = ['wrong', 'needs_correction'].includes(character.category)
          if (isProblem || previous) {
            const nextEntry = {
              _id: wordbookEntryId,
              wordbookEntryId,
              subjectId: result.subjectId,
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
            await wordbookCollection.doc(wordbookEntryId).set({ data: nextEntry })
            if (previous?.monitoringStatus !== nextEntry.monitoringStatus
              && ['monitoring', 'recovered'].includes(nextEntry.monitoringStatus)) {
              const eventType = nextEntry.monitoringStatus === 'monitoring' ? 'entered' : 'exited'
              const monitoringEventId = documentId(
                result.subjectId, character.expectedCharacter, growth.monitoring.ruleVersion, result.updatedAt, eventType
              )
              await monitoringCollection.doc(monitoringEventId).set({
                data: {
                  _id: monitoringEventId,
                  monitoringEventId,
                  subjectId: result.subjectId,
                  targetCharacter: character.expectedCharacter,
                  eventType,
                  reasonCodes: growth.monitoring.reasonCodes,
                  thresholdVersion: growth.monitoring.ruleVersion,
                  occurredAt: result.updatedAt
                }
              })
            }
          }
        }
        await taskCollection.doc(taskId).update({
          data: {
            status: result.status,
            progressStage: result.progressStage,
            resultVersion: result.resultVersion,
            summary: result.summary,
            updatedAt: result.updatedAt
          }
        })
      })
      return this.getTask(taskId)
    },
    async getWordbookEntries(subjectId, filter = 'all') {
      const condition = { subjectId }
      if (filter === 'monitoring') condition.monitoringStatus = 'monitoring'
      if (filter === 'wrong') condition.currentCategory = 'wrong'
      if (filter === 'correction') condition.currentCategory = 'needs_correction'
      const result = await db.collection('wordbook_entries')
        .where(condition)
        .orderBy('updatedAt', 'desc')
        .get()
      return result.data
    },
    async getCharacterGrowth(subjectId, character) {
      const result = await db.collection('growth_segments')
        .where({ subjectId, targetCharacter: character })
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get()
      return result.data[0]?.growthSnapshot ?? null
    },
    async recordConsent(record) {
      await db.collection('consent_records').doc(record.consentRecordId).set({
        data: { ...record, _id: record.consentRecordId }
      })
      return record
    },
    async getConsentStatus(subjectId, purpose) {
      const result = await db.collection('consent_records')
        .where({ subjectId, purpose })
        .orderBy('recordedAt', 'desc')
        .limit(1)
        .get()
      return result.data[0] ?? null
    },
    async getActiveConsent(subjectId, purpose, consentVersion) {
      const latest = await this.getConsentStatus(subjectId, purpose)
      return latest?.decision === 'granted' && latest.consentVersion === consentVersion ? latest : null
    },
    async findFeedbackByIdempotency(subjectId, key) {
      const result = await db.collection('feedback_records')
        .where({ subjectId, feedbackIdempotencyKey: key })
        .limit(1)
        .get()
      return result.data[0] ?? null
    },
    async createFeedback(record) {
      const existing = await this.findFeedbackByIdempotency(record.subjectId, record.feedbackIdempotencyKey)
      if (existing) return existing
      await db.collection('feedback_records').doc(record.feedbackId).set({
        data: { ...record, _id: record.feedbackId }
      })
      return record
    },
    async getFeedbackRecords(subjectId) {
      const result = await db.collection('feedback_records')
        .where({ subjectId })
        .orderBy('createdAt', 'desc')
        .get()
      return result.data
    },
    async findShareByIdempotency(subjectId, key) {
      const result = await db.collection('share_cards')
        .where({ subjectId, shareIdempotencyKey: key })
        .limit(1)
        .get()
      return result.data[0] ?? null
    },
    async createShareCard(card) {
      const existing = await this.findShareByIdempotency(card.subjectId, card.shareIdempotencyKey)
      if (existing) return existing
      await db.collection('share_cards').doc(card.shareCardId).set({
        data: { ...card, _id: card.shareCardId }
      })
      return card
    },
    async getShareCard(shareCardId) {
      try {
        const result = await db.collection('share_cards').doc(shareCardId).get()
        return result.data ?? null
      } catch (error) {
        if (String(error.errCode ?? error.message).includes('NOT_FOUND')) return null
        throw error
      }
    },
    async getShareCardByTokenHash(tokenHash) {
      const result = await db.collection('share_cards')
        .where({ shareTokenHash: tokenHash })
        .limit(1)
        .get()
      return result.data[0] ?? null
    },
    async updateShareCard(shareCardId, patch) {
      await db.collection('share_cards').doc(shareCardId).update({ data: patch })
      return this.getShareCard(shareCardId)
    },
    async appendAuditEvent(event) {
      await db.collection('audit_events').doc(event.auditEventId).set({
        data: { ...event, _id: event.auditEventId }
      })
      return event
    },
    async findDeletionByRequest(subjectId, requestId) {
      const result = await db.collection('deletion_jobs')
        .where({ subjectId, requestId })
        .limit(1)
        .get()
      return result.data[0] ?? null
    },
    async createDeletionJob(job) {
      const existing = await this.findDeletionByRequest(job.subjectId, job.requestId)
      if (existing) return existing
      await db.collection('deletion_jobs').doc(job.deletionJobId).set({
        data: { ...job, _id: job.deletionJobId }
      })
      return job
    },
    async updateDeletionJob(deletionJobId, patch) {
      await db.collection('deletion_jobs').doc(deletionJobId).update({ data: patch })
      const result = await db.collection('deletion_jobs').doc(deletionJobId).get()
      return result.data
    },
    async getDeletionJobs(subjectId) {
      const result = await db.collection('deletion_jobs')
        .where({ subjectId })
        .orderBy('requestedAt', 'desc')
        .get()
      return result.data
    },
    async deletePracticeData(subjectId, rootTaskId, deletedAt) {
      const taskIds = new Set([rootTaskId])
      let expanded = true
      while (expanded) {
        expanded = false
        const related = await db.collection('assessment_tasks').where({ subjectId }).get()
        for (const task of related.data) {
          if (task.reassessmentOfTaskId && taskIds.has(task.reassessmentOfTaskId) && !taskIds.has(task.taskId)) {
            taskIds.add(task.taskId)
            expanded = true
          }
        }
      }
      const affectedCharacters = new Set()
      let characterResults = 0
      for (const taskId of taskIds) {
        const rows = await db.collection('character_results').where({ subjectId, taskId }).get()
        for (const row of rows.data) affectedCharacters.add(row.expectedCharacter)
        characterResults += rows.data.length
        await db.collection('character_results').where({ subjectId, taskId }).remove()
        await db.collection('feedback_records').where({ subjectId, originalTaskId: taskId }).remove()
        await db.collection('feedback_records').where({ subjectId, reassessmentTaskId: taskId }).remove()
        await db.collection('share_cards').where({ subjectId, sourceTaskId: taskId }).remove()
        await db.collection('assessment_tasks').doc(taskId).remove()
      }
      for (const character of affectedCharacters) {
        await db.collection('wordbook_entries').where({ subjectId, targetCharacter: character }).remove()
        await db.collection('growth_segments').where({ subjectId, targetCharacter: character }).remove()
        await db.collection('monitoring_events').where({ subjectId, targetCharacter: character }).remove()
        const remainingResult = await db.collection('character_results')
          .where({ subjectId, expectedCharacter: character })
          .get()
        const rows = remainingResult.data.sort((left, right) => (
          (left.assessedAt ?? left.createdAt).localeCompare(right.assessedAt ?? right.createdAt)
        ))
        if (rows.length === 0) continue
        const points = rows.map((row) => ({
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
        const growth = buildCharacterGrowth({
          studentCharacterId: documentId(subjectId, character),
          character,
          points,
          now: deletedAt
        })
        for (const segment of growth.segments) {
          const growthSegmentId = documentId(subjectId, character, segment.scoreVersion, segment.glyphVersion)
          await db.collection('growth_segments').doc(growthSegmentId).set({ data: {
            _id: growthSegmentId,
            growthSegmentId,
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
          } })
        }
        const hasProblem = points.some((point) => ['wrong', 'needs_correction'].includes(point.category))
        const latest = points[points.length - 1]
        if (hasProblem && latest) {
          const wordbookEntryId = documentId(subjectId, character)
          await db.collection('wordbook_entries').doc(wordbookEntryId).set({ data: {
            _id: wordbookEntryId,
            wordbookEntryId,
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
          } })
        }
      }
      return {
        taskIds: [...taskIds],
        counts: {
          assessmentTasks: taskIds.size,
          characterResults,
          affectedCharacters: affectedCharacters.size
        }
      }
    }
  }
}

module.exports = { createCloudRepository }
