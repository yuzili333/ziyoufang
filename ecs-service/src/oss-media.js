const { createHmac } = require('node:crypto')

const encode = (value) => encodeURIComponent(value).replace(/!/g, '%21').replace(/'/g, '%27')
const hmac = (key, value, encoding) => createHmac('sha256', key).update(value).digest(encoding)
const ossV4Date = (value) => value.toISOString().replace(/[:-]|\.\d{3}/g, '')

function createPostV4Signature({ accessKeyId, accessKeySecret, securityToken, region, now, policy }) {
  const date = ossV4Date(now)
  const shortDate = date.slice(0, 8)
  const scope = `${shortDate}/${region}/oss/aliyun_v4_request`
  const credential = `${accessKeyId}/${scope}`
  const encodedPolicy = Buffer.from(JSON.stringify({
    ...policy,
    conditions: [
      ...policy.conditions,
      { 'x-oss-signature-version': 'OSS4-HMAC-SHA256' },
      { 'x-oss-credential': credential },
      { 'x-oss-date': date },
      { 'x-oss-security-token': securityToken }
    ]
  })).toString('base64')
  const dateKey = hmac(`aliyun_v4${accessKeySecret}`, shortDate)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, 'oss')
  const signingKey = hmac(serviceKey, 'aliyun_v4_request')
  return {
    policy: encodedPolicy,
    fields: {
      'x-oss-signature-version': 'OSS4-HMAC-SHA256',
      'x-oss-credential': credential,
      'x-oss-date': date,
      'x-oss-signature': hmac(signingKey, encodedPolicy, 'hex'),
      'x-oss-security-token': securityToken
    }
  }
}

class EcsRamRoleCredentials {
  constructor({ roleName, metadataBaseUrl, fetchImpl = fetch, now = () => Date.now() }) {
    this.roleName = roleName; this.metadataBaseUrl = metadataBaseUrl.replace(/\/$/, '')
    this.fetchImpl = fetchImpl; this.now = now; this.cached = null
  }
  async get() {
    if (this.cached && Date.parse(this.cached.expiration) - this.now() > 5 * 60 * 1000) return this.cached
    const response = await this.fetchImpl(
      `${this.metadataBaseUrl}/ram/security-credentials/${encode(this.roleName)}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!response.ok) throw new Error('ECS_RAM_ROLE_CREDENTIALS_UNAVAILABLE')
    const body = await response.json()
    if (!body.AccessKeyId || !body.AccessKeySecret || !body.SecurityToken || !body.Expiration) {
      throw new Error('ECS_RAM_ROLE_CREDENTIALS_INVALID')
    }
    this.cached = {
      accessKeyId: body.AccessKeyId, accessKeySecret: body.AccessKeySecret,
      securityToken: body.SecurityToken, expiration: body.Expiration
    }
    return this.cached
  }
}

class OssMediaService {
  constructor({ config, credentials, fetchImpl = fetch, now = () => Date.now() }) {
    this.config = config; this.credentials = credentials; this.fetchImpl = fetchImpl; this.now = now
    const endpoint = new URL(config.endpoint)
    this.objectOrigin = `${endpoint.protocol}//${config.bucket}.${endpoint.host}`
    this.publicObjectOrigin = config.publicAccessHost
  }
  objectRef(key) { return `oss://${this.config.bucket}/${key}` }
  keyFromRef(ref) {
    const prefix = `oss://${this.config.bucket}/`
    if (!ref?.startsWith(prefix)) throw new Error('OSS_OBJECT_REFERENCE_INVALID')
    return ref.slice(prefix.length)
  }
  async createUploadTicket({ task, subjectId, extension }) {
    if (task.subjectId !== subjectId) throw new Error('TASK_FORBIDDEN')
    if (task.status !== 'uploading' || task.submittedAt) throw new Error('UPLOAD_TASK_NOT_ACTIVE')
    if (!['jpg', 'jpeg', 'png'].includes(extension)) throw new Error('UPLOAD_EXTENSION_INVALID')
    const expiresAtMs = Math.min(Date.parse(task.uploadPolicy.expiresAt), this.now() + 15 * 60 * 1000)
    if (expiresAtMs <= this.now()) throw new Error('UPLOAD_TICKET_EXPIRED')
    const key = `${task.privateUploadPath}.${extension}`
    const credentials = await this.credentials.get()
    const signature = createPostV4Signature({
      ...credentials,
      region: this.config.region.replace(/^oss-/, ''),
      now: new Date(this.now()),
      policy: {
      expiration: new Date(expiresAtMs).toISOString(),
      conditions: [
        { bucket: this.config.bucket },
        ['eq', '$key', key],
        ['content-length-range', 1, task.uploadPolicy.maxBytes],
        ['starts-with', '$Content-Type', 'image/']
      ]
      }
    })
    return {
      taskId: task.taskId,
      mediaId: `media_${task.taskId}_source`,
      expiresAt: new Date(expiresAtMs).toISOString(),
      uploadUrl: this.config.publicUploadHost,
      formFields: {
        key,
        'Content-Type': extension === 'png' ? 'image/png' : 'image/jpeg',
        policy: signature.policy,
        ...signature.fields,
        success_action_status: '200'
      }
    }
  }
  async signedRequest(method, key) {
    const credentials = await this.credentials.get()
    const date = new Date(this.now()).toUTCString()
    const resource = `/${this.config.bucket}/${key}`
    const canonical = `${method}\n\n\n${date}\nx-oss-security-token:${credentials.securityToken}\n${resource}`
    const signature = createHmac('sha1', credentials.accessKeySecret).update(canonical).digest('base64')
    return this.fetchImpl(`${this.objectOrigin}/${key.split('/').map(encode).join('/')}`, {
      method,
      headers: {
        Date: date,
        'x-oss-security-token': credentials.securityToken,
        Authorization: `OSS ${credentials.accessKeyId}:${signature}`
      },
      signal: AbortSignal.timeout(10000)
    })
  }
  async verifyUpload({ task, subjectId, mediaId, etag }) {
    if (task.subjectId !== subjectId) return false
    if (mediaId !== `media_${task.taskId}_source`) return false
    for (const extension of task.uploadPolicy.allowedExtensions) {
      const key = `${task.privateUploadPath}.${extension}`
      const response = await this.signedRequest('HEAD', key)
      if (response.status === 404) continue
      if (!response.ok) throw new Error('OSS_HEAD_OBJECT_FAILED')
      const size = Number(response.headers.get('content-length'))
      const actualEtag = response.headers.get('etag')?.replaceAll('"', '')
      if (!Number.isFinite(size) || size < 1 || size > task.uploadPolicy.maxBytes) return false
      if (!etag || actualEtag?.toLowerCase() !== etag.replace(/"/g, '').toLowerCase()) return false
      return { privateObjectRef: this.objectRef(key), mediaId, size, etag: actualEtag, extension }
    }
    return false
  }
  async createAccess(ref, ttlMs = 10 * 60 * 1000) {
    const key = this.keyFromRef(ref)
    const credentials = await this.credentials.get()
    const expires = Math.floor((this.now() + ttlMs) / 1000)
    const resource = `/${this.config.bucket}/${key}`
    const signature = createHmac('sha1', credentials.accessKeySecret).update(`GET\n\n\n${expires}\n${resource}`).digest('base64')
    const url = new URL(`${this.publicObjectOrigin}/${key.split('/').map(encode).join('/')}`)
    url.searchParams.set('OSSAccessKeyId', credentials.accessKeyId)
    url.searchParams.set('Expires', String(expires))
    url.searchParams.set('Signature', signature)
    url.searchParams.set('security-token', credentials.securityToken)
    return { url: url.toString(), expiresAt: new Date(expires * 1000).toISOString() }
  }
  async delete(ref) {
    const response = await this.signedRequest('DELETE', this.keyFromRef(ref))
    if (!response.ok && response.status !== 404) throw new Error('OSS_DELETE_OBJECT_FAILED')
    return true
  }
}

module.exports = { EcsRamRoleCredentials, OssMediaService, createPostV4Signature }
