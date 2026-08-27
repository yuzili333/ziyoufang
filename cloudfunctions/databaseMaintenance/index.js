const cloud = require('wx-server-sdk')

const { createExpirationCleanup } = require('./core/expiration-cleanup')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const parseBatchLimit = () => {
  const value = Number(process.env.EXPIRATION_CLEANUP_BATCH_LIMIT ?? 100)
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('EXPIRATION_BATCH_LIMIT_INVALID')
  }
  return value
}

exports.main = async () => {
  const cleanup = createExpirationCleanup({
    db: cloud.database(),
    deleteCloudFiles: (fileList) => cloud.deleteFile({ fileList }),
    batchLimit: parseBatchLimit()
  })
  const summary = await cleanup.run()
  console.log(JSON.stringify({
    event: 'expiration_cleanup_completed',
    scanned: summary.scanned,
    deleted: summary.deleted,
    failureCount: summary.failures.length,
    failureCodes: [...new Set(summary.failures.map((failure) => failure.code))]
  }))
  return summary
}
