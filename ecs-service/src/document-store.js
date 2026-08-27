const { toMysqlDate } = require('./mysql')

const TABLES = new Set([
  'subject_accounts', 'assessment_tasks', 'character_results', 'wordbook_entries',
  'growth_segments', 'monitoring_events', 'consent_records', 'media_objects',
  'feedback_records', 'share_cards', 'audit_events', 'deletion_jobs', 'quota_events',
  'idempotency_records'
])

const tableName = (value) => {
  if (!TABLES.has(value)) throw new Error('DOCUMENT_TABLE_INVALID')
  return `\`${value}\``
}

const idFor = (document) => document._id ?? document.taskId ?? document.subjectId
  ?? document.characterResultId ?? document.wordbookEntryId ?? document.growthSegmentId
  ?? document.monitoringEventId ?? document.consentRecordId ?? document.mediaId
  ?? document.feedbackId ?? document.shareCardId ?? document.auditEventId
  ?? document.deletionJobId ?? document.quotaEventId ?? document.idempotencyRecordId

function columns(document) {
  return {
    subjectId: document.subjectId ?? null,
    taskId: document.taskId ?? document.sourceTaskId ?? document.originalTaskId ?? null,
    status: document.status ?? document.lifecycleStatus ?? document.decision ?? null,
    expiresAt: toMysqlDate(document.expiresAt),
    idempotencyKey: document.idempotencyKey ?? document.feedbackIdempotencyKey
      ?? document.shareIdempotencyKey ?? document.requestId ?? null,
    lookupKey: document.shareTokenHash ?? document.targetCharacter ?? document.expectedCharacter
      ?? document.purpose ?? document.wechatSubjectKey ?? null,
    sortAt: toMysqlDate(document.updatedAt ?? document.createdAt ?? document.recordedAt
      ?? document.requestedAt ?? document.occurredAt ?? document.assessedAt)
  }
}

class MySqlDocumentStore {
  constructor(pool) { this.pool = pool }

  async put(table, document, connection = this.pool) {
    const id = idFor(document)
    if (!id) throw new Error('DOCUMENT_ID_REQUIRED')
    const value = { ...document, _id: id }
    const c = columns(value)
    await connection.execute(
      `INSERT INTO ${tableName(table)}
       (id, subject_id, task_id, status, expires_at, idempotency_key, lookup_key, sort_at, document)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE subject_id=VALUES(subject_id), task_id=VALUES(task_id),
       status=VALUES(status), expires_at=VALUES(expires_at), idempotency_key=VALUES(idempotency_key),
       lookup_key=VALUES(lookup_key), sort_at=VALUES(sort_at), document=VALUES(document)`,
      [id, c.subjectId, c.taskId, c.status, c.expiresAt, c.idempotencyKey, c.lookupKey, c.sortAt, JSON.stringify(value)]
    )
    return structuredClone(value)
  }

  async get(table, id, connection = this.pool, { forUpdate = false } = {}) {
    const [rows] = await connection.execute(
      `SELECT document FROM ${tableName(table)} WHERE id=?${forUpdate ? ' FOR UPDATE' : ''}`,
      [id]
    )
    return rows[0] ? this.parse(rows[0].document) : null
  }

  async find(table, filters = {}, connection = this.pool, { order = 'DESC', limit } = {}) {
    const clauses = []
    const values = []
    const mapping = {
      subjectId: 'subject_id', taskId: 'task_id', status: 'status',
      idempotencyKey: 'idempotency_key', lookupKey: 'lookup_key'
    }
    for (const [key, value] of Object.entries(filters)) {
      if (!mapping[key]) continue
      clauses.push(`${mapping[key]}=?`)
      values.push(value)
    }
    const direction = order === 'ASC' ? 'ASC' : 'DESC'
    const sql = `SELECT document FROM ${tableName(table)}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY COALESCE(sort_at, '1970-01-01') ${direction}${limit ? ` LIMIT ${Number(limit)}` : ''}`
    const [rows] = await connection.execute(sql, values)
    return rows.map((row) => this.parse(row.document))
  }

  async patch(table, id, patch, connection = this.pool) {
    const current = await this.get(table, id, connection, { forUpdate: connection !== this.pool })
    if (!current) throw new Error('DOCUMENT_NOT_FOUND')
    return this.put(table, { ...current, ...structuredClone(patch), _id: id }, connection)
  }

  async remove(table, id, connection = this.pool) {
    const [result] = await connection.execute(`DELETE FROM ${tableName(table)} WHERE id=?`, [id])
    return result.affectedRows
  }

  async removeWhere(table, filters, connection = this.pool) {
    const rows = await this.find(table, filters, connection)
    for (const row of rows) await this.remove(table, row._id, connection)
    return rows.length
  }

  parse(value) { return typeof value === 'string' ? JSON.parse(value) : value }
}

module.exports = { MySqlDocumentStore, TABLES }
