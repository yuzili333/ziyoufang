const { createHash, randomUUID } = require('node:crypto')

const missingDocument = (error) => /NOT_FOUND|NOT_EXISTED/.test(String(error?.errCode ?? error?.message ?? error))

class CloudSlidingWindowQuota {
  constructor({ db, windowMs, maximum, policyVersion, idFactory = randomUUID }) {
    if (!db?.runTransaction || !db?.command?.gte) throw new Error('DISTRIBUTED_QUOTA_DATABASE_REQUIRED')
    if (!Number.isInteger(windowMs) || windowMs <= 0) throw new Error('QUOTA_WINDOW_INVALID')
    if (!Number.isInteger(maximum) || maximum <= 0) throw new Error('QUOTA_MAXIMUM_INVALID')
    if (!policyVersion) throw new Error('QUOTA_POLICY_VERSION_REQUIRED')
    this.db = db
    this.windowMs = windowMs
    this.maximum = maximum
    this.policyVersion = policyVersion
    this.idFactory = idFactory
  }

  eventId(subjectId, idempotencyKey) {
    if (idempotencyKey) {
      return `quota_${createHash('sha256').update(`${subjectId}\u0000${idempotencyKey}`).digest('hex').slice(0, 48)}`
    }
    return `quota_${this.idFactory()}`
  }

  async consume(subjectId, nowMs = Date.now(), idempotencyKey = '') {
    const now = new Date(nowMs)
    const cutoff = new Date(nowMs - this.windowMs)
    const eventId = this.eventId(subjectId, idempotencyKey)
    return this.db.runTransaction(async (transaction) => {
      const events = transaction.collection('quota_events')
      try {
        const duplicate = (await events.doc(eventId).get()).data ?? null
        if (duplicate) {
          return {
            allowed: true,
            retryAfterMs: 0,
            remaining: null,
            policyVersion: this.policyVersion,
            duplicate: true
          }
        }
      } catch (error) {
        if (!missingDocument(error)) throw error
      }
      const active = await events
        .where({ subjectId, policyVersion: this.policyVersion, occurredAt: this.db.command.gte(cutoff.toISOString()) })
        .orderBy('occurredAt', 'asc')
        .limit(this.maximum)
        .get()
      if (active.data.length >= this.maximum) {
        const oldestAt = Date.parse(active.data[0].occurredAt)
        return {
          allowed: false,
          retryAfterMs: Math.max(1, oldestAt + this.windowMs - nowMs),
          remaining: 0,
          policyVersion: this.policyVersion
        }
      }
      await events.doc(eventId).set({
        data: {
          _id: eventId,
          quotaEventId: eventId,
          subjectId,
          policyVersion: this.policyVersion,
          occurredAt: now.toISOString(),
          expiresAt: new Date(nowMs + this.windowMs).toISOString()
        }
      })
      return {
        allowed: true,
        retryAfterMs: 0,
        remaining: this.maximum - active.data.length - 1,
        policyVersion: this.policyVersion,
        duplicate: false
      }
    })
  }
}

module.exports = { CloudSlidingWindowQuota }
