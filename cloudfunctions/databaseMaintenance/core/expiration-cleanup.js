const { createHash } = require('node:crypto')

const digest = (value) => createHash('sha256').update(value).digest('hex')
const errorCode = (error) => String(error?.errCode ?? error?.code ?? error?.message ?? 'UNKNOWN_ERROR')
  .replace(/[^A-Za-z0-9_-]/g, '_')
  .slice(0, 80)

const storageDeletionSucceeded = (result) => {
  const file = result?.fileList?.[0]
  if (!file) return false
  if (file.status === 0) return true
  return /not[_\s-]?(found|exist)|file[_\s-]?not[_\s-]?exist/i.test(String(file.errMsg ?? file.error ?? ''))
}

function createExpirationCleanup({ db, deleteCloudFiles, now = () => new Date(), batchLimit = 100 }) {
  if (!db?.collection || !db?.command?.lte) throw new Error('DOCUMENT_DATABASE_REQUIRED')
  if (typeof deleteCloudFiles !== 'function') throw new Error('CLOUD_FILE_DELETER_REQUIRED')
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 100) {
    throw new Error('EXPIRATION_BATCH_LIMIT_INVALID')
  }

  const expiredRows = async (collectionName, cutoff, limit) => {
    if (limit <= 0) return []
    const result = await db.collection(collectionName)
      .where({ expiresAt: db.command.lte(cutoff) })
      .orderBy('expiresAt', 'asc')
      .limit(limit)
      .get()
    return result.data ?? []
  }

  const removeDocument = (collectionName, row) => db.collection(collectionName).doc(row._id).remove()

  const expireShareCard = async (row) => {
    const occurredAt = row.expiresAt
    const auditEventId = `audit_${digest(`share-expired\u0000${row._id}`).slice(0, 48)}`
    await db.collection('audit_events').doc(auditEventId).set({ data: {
      _id: auditEventId,
      auditEventId,
      subjectId: row.subjectId,
      eventType: 'share_expired',
      actorType: 'system',
      resourceType: 'share_card',
      resourceIdHash: digest(row._id),
      occurredAt
    } })
    await removeDocument('share_cards', row)
  }

  const expireMediaObject = async (row, deletedAt) => {
    if (row.lifecycleStatus !== 'storage_deleted') {
      const result = await deleteCloudFiles([row.privateObjectRef])
      if (!storageDeletionSucceeded(result)) throw new Error('PRIVATE_MEDIA_DELETE_FAILED')
      await db.collection('media_objects').doc(row._id).update({ data: {
        lifecycleStatus: 'storage_deleted',
        storageDeletedAt: deletedAt
      } })
    }
    await removeDocument('media_objects', row)
  }

  const processRows = async (collectionName, rows, action, summary) => {
    for (const row of rows) {
      summary.scanned += 1
      try {
        await action(row)
        summary.deleted[collectionName] += 1
      } catch (error) {
        summary.failures.push({ collection: collectionName, code: errorCode(error) })
      }
    }
  }

  return {
    async run() {
      const cleanupTime = now()
      if (!(cleanupTime instanceof Date) || !Number.isFinite(cleanupTime.getTime())) {
        throw new Error('EXPIRATION_CLEANUP_TIME_INVALID')
      }
      const cutoff = cleanupTime.toISOString()
      const summary = {
        cutoff,
        limit: batchLimit,
        scanned: 0,
        deleted: { quota_events: 0, share_cards: 0, media_objects: 0 },
        failures: []
      }
      const stages = [
        ['quota_events', (row) => removeDocument('quota_events', row)],
        ['share_cards', expireShareCard],
        ['media_objects', (row) => expireMediaObject(row, cutoff)]
      ]
      for (const [index, [collectionName, action]] of stages.entries()) {
        const remaining = batchLimit - summary.scanned
        if (remaining <= 0) break
        const remainingStages = stages.length - index
        const fairLimit = Math.ceil(remaining / remainingStages)
        const rows = await expiredRows(collectionName, cutoff, fairLimit)
        await processRows(collectionName, rows, action, summary)
      }
      return summary
    }
  }
}

module.exports = { createExpirationCleanup, storageDeletionSucceeded }
