const { createHash, randomUUID } = require('node:crypto')

class MySqlSlidingWindowQuota {
  constructor({ pool, store, windowMs, maximum, policyVersion, now = () => Date.now() }) {
    this.pool = pool; this.store = store; this.windowMs = windowMs
    this.maximum = maximum; this.policyVersion = policyVersion; this.now = now
  }
  async consume(subjectId, nowMs = this.now(), idempotencyKey) {
    const lock = `quota:${createHash('sha256').update(subjectId).digest('hex').slice(0, 32)}`
    const connection = await this.pool.getConnection()
    try {
      const [[acquired]] = await connection.execute('SELECT GET_LOCK(?, 3) AS acquired', [lock])
      if (acquired.acquired !== 1) throw new Error('QUOTA_LOCK_UNAVAILABLE')
      const existing = (await this.store.find('quota_events', { subjectId, idempotencyKey }, connection, { limit: 1 }))[0]
      if (existing) return { allowed: true, retryAfterMs: 0, remaining: existing.remaining, policyVersion: this.policyVersion }
      const [rows] = await connection.execute(
        'SELECT expires_at FROM quota_events WHERE subject_id=? AND expires_at>? ORDER BY expires_at ASC',
        [subjectId, new Date(nowMs)]
      )
      if (rows.length >= this.maximum) return {
        allowed: false,
        retryAfterMs: Math.max(1, new Date(rows[0].expires_at).getTime() - nowMs),
        remaining: 0,
        policyVersion: this.policyVersion
      }
      const remaining = this.maximum - rows.length - 1
      const quotaEventId = `quota_${randomUUID()}`
      await this.store.put('quota_events', {
        _id: quotaEventId, quotaEventId,
        subjectId, idempotencyKey, policyVersion: this.policyVersion, remaining,
        occurredAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + this.windowMs).toISOString()
      }, connection)
      return { allowed: true, retryAfterMs: 0, remaining, policyVersion: this.policyVersion }
    } finally {
      await connection.execute('SELECT RELEASE_LOCK(?)', [lock]).catch(() => undefined)
      connection.release()
    }
  }
}

module.exports = { MySqlSlidingWindowQuota }
