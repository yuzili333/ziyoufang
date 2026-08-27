const { loadConfig } = require('./config')
const { createPool } = require('./mysql')
const { MySqlDocumentStore } = require('./document-store')
const { MySqlBffRepository } = require('./mysql-repository')
const { SessionService } = require('./session-service')
const { WechatLoginClient } = require('./wechat-client')
const { EcsRamRoleCredentials, OssMediaService } = require('./oss-media')
const { MySqlAssessmentQueue } = require('./job-queue')
const { MySqlSlidingWindowQuota } = require('./mysql-quota')

function bootstrap(env = process.env) {
  const config = loadConfig(env)
  const pool = createPool(config.mysql)
  const store = new MySqlDocumentStore(pool)
  const repository = new MySqlBffRepository({ pool, store })
  const credentials = new EcsRamRoleCredentials({
    roleName: config.oss.ramRoleName, metadataBaseUrl: config.oss.metadataBaseUrl
  })
  const media = new OssMediaService({ config: config.oss, credentials })
  const queue = new MySqlAssessmentQueue({ pool, leaseMs: config.leaseMs })
  const sessions = new SessionService({ pool, pepper: config.secrets.sessionTokenPepper })
  const wechat = new WechatLoginClient({ appId: config.wechatAppId, appSecret: config.wechatAppSecret })
  const quotaGuard = new MySqlSlidingWindowQuota({
    pool, store, windowMs: config.quota.windowMs, maximum: config.quota.maximum,
    policyVersion: config.versions.quotaPolicy
  })
  return { config, pool, store, repository, media, queue, sessions, wechat, quotaGuard }
}

module.exports = { bootstrap }
