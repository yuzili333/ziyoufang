const { createHash, createHmac, randomUUID } = require('node:crypto')

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

class SynchronousAssessmentClient {
  constructor({ baseUrl, secret, fetchImpl = fetch }) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.secret = secret; this.fetchImpl = fetchImpl
  }
  async run(task) {
    const method = 'POST'
    const path = '/internal/v1/assessments:run'
    const body = JSON.stringify(task)
    const timestamp = new Date().toISOString()
    const nonce = randomUUID()
    const canonical = [method, path, timestamp, nonce, sha256(body)].join('\n')
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-request-timestamp': timestamp,
        'x-request-nonce': nonce,
        'x-signature': createHmac('sha256', this.secret).update(canonical).digest('hex')
      },
      body,
      signal: AbortSignal.timeout(120000)
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error ?? `ASSESSMENT_HTTP_${response.status}`)
    return value
  }
}

module.exports = { SynchronousAssessmentClient }
