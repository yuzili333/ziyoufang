import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function canonicalRequest({ method, path, timestamp, nonce, body }) {
  return [method.toUpperCase(), path, timestamp, nonce, sha256(body)].join('\n')
}

export function signRequest(input, secret) {
  if (!secret) throw new Error('BFF_HMAC_SECRET_REQUIRED')
  return createHmac('sha256', secret).update(canonicalRequest(input)).digest('hex')
}

export function verifyRequest(input, signature, secret, now = Date.now()) {
  if (!signature || !secret) return false
  const timestamp = Date.parse(input.timestamp)
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 5 * 60_000) return false
  const expected = Buffer.from(signRequest(input, secret), 'hex')
  const actual = Buffer.from(signature, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export class NonceReplayGuard {
  constructor({ ttlMs = 5 * 60_000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs
    this.now = now
    this.nonces = new Map()
  }

  consume(nonce) {
    if (typeof nonce !== 'string' || !nonce) return false
    const current = this.now()
    for (const [value, expiresAt] of this.nonces) {
      if (expiresAt <= current) this.nonces.delete(value)
    }
    if (this.nonces.has(nonce)) return false
    this.nonces.set(nonce, current + this.ttlMs)
    return true
  }
}
