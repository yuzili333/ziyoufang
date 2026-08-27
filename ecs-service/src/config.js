const path = require('node:path')

const required = (name, env = process.env) => {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name}_REQUIRED`)
  return value
}

const positiveInteger = (name, fallback, env = process.env) => {
  const value = Number(env[name] ?? fallback)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name}_INVALID`)
  return value
}

const httpsOrigin = (name, env = process.env) => {
  const raw = required(name, env)
  let url
  try { url = new URL(raw) } catch { throw new Error(`${name}_INVALID`) }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
    || url.search || url.hash || url.port) throw new Error(`${name}_HTTPS_ORIGIN_REQUIRED`)
  return url.origin
}

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const config = {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: positiveInteger('PORT', 8080, env),
    publicApiBaseUrl: httpsOrigin('PUBLIC_API_BASE_URL', env),
    wechatAppId: required('WECHAT_APP_ID', env),
    wechatAppSecret: required('WECHAT_APP_SECRET', env),
    mysql: {
      host: required('MYSQL_ADDRESS', env),
      port: positiveInteger('MYSQL_PORT', 3306, env),
      database: required('MYSQL_DATABASE', env),
      user: required('MYSQL_USERNAME', env),
      password: required('MYSQL_PASSWORD', env),
      connectionLimit: positiveInteger('MYSQL_POOL_MAX', 10, env),
      sslMode: env.MYSQL_SSL_MODE ?? 'VERIFY_IDENTITY',
      sslCaFile: required('MYSQL_SSL_CA_FILE', env)
    },
    oss: {
      region: required('OSS_REGION', env),
      endpoint: httpsOrigin('OSS_ENDPOINT', env),
      publicUploadHost: httpsOrigin('OSS_PUBLIC_UPLOAD_HOST', env),
      publicAccessHost: httpsOrigin('OSS_PUBLIC_ACCESS_HOST', env),
      bucket: required('OSS_BUCKET', env),
      ramRoleName: required('OSS_RAM_ROLE_NAME', env),
      metadataBaseUrl: env.ECS_METADATA_BASE_URL ?? 'http://100.100.100.200/latest/meta-data'
    },
    secrets: {
      subjectId: required('SUBJECT_ID_HMAC_SECRET', env),
      sessionTokenPepper: required('SESSION_TOKEN_PEPPER', env),
      shareToken: required('SHARE_TOKEN_SECRET', env),
      bffHmac: required('BFF_HMAC_SECRET', env),
      telemetryHash: required('TELEMETRY_HASH_SECRET', env)
    },
    versions: {
      consent: required('CONSENT_VERSION', env),
      shareConsent: required('SHARE_CONSENT_VERSION', env),
      deletionConfirmation: required('DELETION_CONFIRMATION_VERSION', env),
      quotaPolicy: required('QUOTA_POLICY_VERSION', env)
    },
    quota: {
      windowMs: positiveInteger('QUOTA_WINDOW_MS', 3600000, env),
      maximum: positiveInteger('QUOTA_MAX_TASKS', 30, env)
    },
    assessmentServiceBaseUrl: env.ASSESSMENT_SERVICE_BASE_URL ?? 'http://assessment:8080',
    workerConcurrency: positiveInteger('WORKER_CONCURRENCY', 1, env),
    leaseMs: positiveInteger('ASSESSMENT_JOB_LEASE_MS', 300000, env),
    heartbeatMs: positiveInteger('ASSESSMENT_JOB_HEARTBEAT_MS', 30000, env),
    cleanupBatchLimit: positiveInteger('EXPIRATION_CLEANUP_BATCH_LIMIT', 100, env),
    migrationDir: path.resolve(__dirname, '../migrations')
  }
  if (production) {
    for (const [name, value] of Object.entries(config.secrets)) {
      if (Buffer.byteLength(value, 'utf8') < 32) throw new Error(`${name.toUpperCase()}_MINIMUM_32_BYTES_REQUIRED`)
    }
    if (new Set(Object.values(config.secrets)).size !== Object.keys(config.secrets).length) {
      throw new Error('PRODUCTION_SECRETS_MUST_BE_DISTINCT')
    }
    for (const version of Object.values(config.versions)) {
      if (/draft/i.test(version)) throw new Error('PRODUCTION_VERSION_NOT_APPROVED')
    }
  }
  return config
}

module.exports = { loadConfig }
