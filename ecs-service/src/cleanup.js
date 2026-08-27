class ExpirationCleanup {
  constructor({ pool, store, media, sessions, batchLimit = 100 }) {
    this.pool = pool; this.store = store; this.media = media; this.sessions = sessions; this.batchLimit = batchLimit
  }
  async run() {
    const [[lock]] = await this.pool.execute("SELECT GET_LOCK('ziyoufang:expiration-cleanup', 0) AS acquired")
    if (lock.acquired !== 1) return { skipped: true }
    const counts = { quotaEvents: 0, shareCards: 0, mediaObjects: 0, sessions: 0 }
    try {
      counts.sessions = await this.sessions.purgeExpired()
      const [quota] = await this.pool.query(
        'SELECT id FROM quota_events WHERE expires_at <= UTC_TIMESTAMP(3) ORDER BY expires_at LIMIT ?', [this.batchLimit]
      )
      for (const row of quota) counts.quotaEvents += await this.store.remove('quota_events', row.id)
      const remaining = Math.max(0, this.batchLimit - counts.quotaEvents)
      const [shares] = await this.pool.query(
        'SELECT id FROM share_cards WHERE expires_at <= UTC_TIMESTAMP(3) ORDER BY expires_at LIMIT ?', [remaining]
      )
      for (const row of shares) counts.shareCards += await this.store.remove('share_cards', row.id)
      const mediaLimit = Math.max(0, remaining - counts.shareCards)
      const [objects] = await this.pool.query(
        'SELECT id, document FROM media_objects WHERE expires_at <= UTC_TIMESTAMP(3) ORDER BY expires_at LIMIT ?', [mediaLimit]
      )
      for (const row of objects) {
        const object = this.store.parse(row.document)
        try {
          await this.media.delete(object.privateObjectRef)
          counts.mediaObjects += await this.store.remove('media_objects', row.id)
        } catch { /* retain for the next idempotent cleanup cycle */ }
      }
      return counts
    } finally { await this.pool.execute("SELECT RELEASE_LOCK('ziyoufang:expiration-cleanup')") }
  }
}

module.exports = { ExpirationCleanup }
