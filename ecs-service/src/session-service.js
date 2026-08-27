const { createHash, randomBytes } = require('node:crypto')
const { toMysqlDate } = require('./mysql')

class SessionService {
  constructor({ pool, pepper, ttlMs = 2 * 60 * 60 * 1000, now = () => Date.now() }) {
    this.pool = pool; this.pepper = pepper; this.ttlMs = ttlMs; this.now = now
  }
  hash(token) { return createHash('sha256').update(`${this.pepper}\u0000${token}`).digest('hex') }
  async issue(subjectId) {
    const token = randomBytes(32).toString('base64url')
    const createdAt = new Date(this.now())
    const expiresAt = new Date(createdAt.getTime() + this.ttlMs)
    await this.pool.execute(
      'INSERT INTO auth_sessions(token_hash, subject_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      [this.hash(token), subjectId, toMysqlDate(expiresAt), toMysqlDate(createdAt), toMysqlDate(createdAt)]
    )
    return { token, expiresAt: expiresAt.toISOString() }
  }
  async resolve(token) {
    if (typeof token !== 'string' || token.length < 32) return null
    const tokenHash = this.hash(token)
    const [rows] = await this.pool.execute(
      'SELECT subject_id, expires_at FROM auth_sessions WHERE token_hash=? AND expires_at > UTC_TIMESTAMP(3)', [tokenHash]
    )
    if (!rows[0]) return null
    await this.pool.execute('UPDATE auth_sessions SET last_seen_at=UTC_TIMESTAMP(3) WHERE token_hash=?', [tokenHash])
    return { subjectId: rows[0].subject_id, expiresAt: new Date(rows[0].expires_at).toISOString() }
  }
  async purgeExpired() {
    const [result] = await this.pool.execute('DELETE FROM auth_sessions WHERE expires_at <= UTC_TIMESTAMP(3)')
    return result.affectedRows
  }
}

module.exports = { SessionService }
