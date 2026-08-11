class SlidingWindowQuota {
  constructor({ windowMs, maximum, policyVersion }) {
    if (!Number.isInteger(windowMs) || windowMs <= 0) throw new Error('QUOTA_WINDOW_INVALID')
    if (!Number.isInteger(maximum) || maximum <= 0) throw new Error('QUOTA_MAXIMUM_INVALID')
    if (!policyVersion) throw new Error('QUOTA_POLICY_VERSION_REQUIRED')
    this.windowMs = windowMs
    this.maximum = maximum
    this.policyVersion = policyVersion
    this.events = new Map()
  }

  consume(subjectId, nowMs = Date.now()) {
    const cutoff = nowMs - this.windowMs
    const active = (this.events.get(subjectId) ?? []).filter((timestamp) => timestamp > cutoff)
    if (active.length >= this.maximum) {
      const retryAfterMs = Math.max(1, active[0] + this.windowMs - nowMs)
      this.events.set(subjectId, active)
      return {
        allowed: false,
        retryAfterMs,
        remaining: 0,
        policyVersion: this.policyVersion
      }
    }
    active.push(nowMs)
    this.events.set(subjectId, active)
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: this.maximum - active.length,
      policyVersion: this.policyVersion
    }
  }
}

module.exports = { SlidingWindowQuota }
