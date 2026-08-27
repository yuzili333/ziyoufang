const assert = require('node:assert/strict')
const test = require('node:test')
const { loadConfig } = require('../src/config')

const base = {
  NODE_ENV: 'production', PORT: '8080', PUBLIC_API_BASE_URL: 'https://api.example.com/',
  WECHAT_APP_ID: 'wx-test', WECHAT_APP_SECRET: 'wechat-secret',
  MYSQL_ADDRESS: 'mysql.internal', MYSQL_DATABASE: 'ziyoufang', MYSQL_USERNAME: 'app', MYSQL_PASSWORD: 'db-secret',
  MYSQL_SSL_CA_FILE: '/run/secrets/mysql-ca.pem',
  OSS_REGION: 'oss-cn-hangzhou', OSS_ENDPOINT: 'https://oss-cn-hangzhou.aliyuncs.com',
  OSS_PUBLIC_UPLOAD_HOST: 'https://bucket.oss-cn-hangzhou.aliyuncs.com', OSS_BUCKET: 'bucket', OSS_RAM_ROLE_NAME: 'role',
  OSS_PUBLIC_ACCESS_HOST: 'https://bucket.oss-cn-hangzhou.aliyuncs.com',
  SUBJECT_ID_HMAC_SECRET: 's'.repeat(32), SESSION_TOKEN_PEPPER: 'p'.repeat(32),
  SHARE_TOKEN_SECRET: 'h'.repeat(32), BFF_HMAC_SECRET: 'b'.repeat(32), TELEMETRY_HASH_SECRET: 't'.repeat(32),
  CONSENT_VERSION: 'consent-v1', SHARE_CONSENT_VERSION: 'share-v1',
  DELETION_CONFIRMATION_VERSION: 'delete-v1', QUOTA_POLICY_VERSION: 'quota-v1'
}

test('production configuration requires purpose-distinct secrets and approved versions', () => {
  const config = loadConfig(base)
  assert.equal(config.publicApiBaseUrl, 'https://api.example.com')
  assert.equal(config.oss.publicAccessHost, 'https://bucket.oss-cn-hangzhou.aliyuncs.com')
  assert.equal(config.workerConcurrency, 1)
  assert.throws(() => loadConfig({ ...base, PUBLIC_API_BASE_URL: 'http://api.example.com' }), /HTTPS_ORIGIN/)
  assert.throws(() => loadConfig({ ...base, OSS_PUBLIC_ACCESS_HOST: 'https://bucket.example.com/path' }), /HTTPS_ORIGIN/)
  assert.throws(() => loadConfig({ ...base, SHARE_TOKEN_SECRET: base.BFF_HMAC_SECRET }), /DISTINCT/)
  assert.throws(() => loadConfig({ ...base, CONSENT_VERSION: 'draft-v1' }), /NOT_APPROVED/)
})
