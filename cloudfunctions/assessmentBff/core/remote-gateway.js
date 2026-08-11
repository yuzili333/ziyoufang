const { createHash, createHmac, randomUUID } = require('node:crypto')

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

class RemoteAssessmentGateway {
  constructor({ baseUrl, secret, fetchImpl = fetch }) {
    if (!baseUrl) throw new Error('ASSESSMENT_SERVICE_BASE_URL_REQUIRED')
    if (!secret) throw new Error('BFF_HMAC_SECRET_REQUIRED')
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.secret = secret
    this.fetchImpl = fetchImpl
  }

  headers(method, path, body) {
    const timestamp = new Date().toISOString()
    const nonce = randomUUID()
    const canonical = [method, path, timestamp, nonce, sha256(body)].join('\n')
    const signature = createHmac('sha256', this.secret).update(canonical).digest('hex')
    return {
      'content-type': 'application/json',
      'x-request-timestamp': timestamp,
      'x-request-nonce': nonce,
      'x-signature': signature
    }
  }

  async request(method, path, payload, additionalHeaders = {}) {
    const body = payload === undefined ? '' : JSON.stringify(payload)
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { ...this.headers(method, path, body), ...additionalHeaders },
      body: body || undefined
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error ?? `ASSESSMENT_HTTP_${response.status}`)
    return value
  }

  async start(task) {
    return this.request('POST', '/v1/assessments', task, {
      'idempotency-key': task.idempotencyKey,
      'x-task-id': task.taskId
    })
  }

  async get(taskId) {
    return this.request('GET', `/v1/assessments/${taskId}`)
  }

  async cancel(taskId) {
    return this.request('POST', `/v1/assessments/${taskId}/cancel`, {})
  }
}

module.exports = { RemoteAssessmentGateway }
