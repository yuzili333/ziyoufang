const { randomUUID } = require('node:crypto')
const { toMysqlDate } = require('./mysql')

class MySqlAssessmentQueue {
  constructor({ pool, leaseMs = 300000, now = () => Date.now() }) {
    this.pool = pool; this.leaseMs = leaseMs; this.now = now
  }
  async enqueue(task, connection = this.pool) {
    const now = new Date(this.now())
    await connection.execute(
      `INSERT INTO assessment_jobs
       (job_id, task_id, subject_id, status, attempts, max_attempts, next_attempt_at, payload, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', 0, 3, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE payload=IF(status IN ('failed','cancelled'), VALUES(payload), payload),
       next_attempt_at=IF(status='failed',VALUES(next_attempt_at),next_attempt_at), status=IF(status='failed','queued',status),
       updated_at=VALUES(updated_at)`,
      [`job_${randomUUID()}`, task.taskId, task.subjectId, toMysqlDate(now), JSON.stringify(task), toMysqlDate(now), toMysqlDate(now)]
    )
    return { taskId: task.taskId, status: 'analyzing', progressStage: 'quality_checking' }
  }
  async claim(owner) {
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [rows] = await connection.query(
        `SELECT job_id, task_id, subject_id, attempts, max_attempts, payload
         FROM assessment_jobs
         WHERE ((status='queued' AND next_attempt_at <= UTC_TIMESTAMP(3))
           OR (status='leased' AND lease_expires_at <= UTC_TIMESTAMP(3)))
         ORDER BY next_attempt_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
      )
      if (!rows[0]) { await connection.commit(); return null }
      const leaseExpiresAt = new Date(this.now() + this.leaseMs)
      await connection.execute(
        `UPDATE assessment_jobs SET status='leased', lease_owner=?, lease_expires_at=?,
         attempts=attempts+1, updated_at=UTC_TIMESTAMP(3) WHERE job_id=?`,
        [owner, toMysqlDate(leaseExpiresAt), rows[0].job_id]
      )
      await connection.commit()
      return {
        jobId: rows[0].job_id, taskId: rows[0].task_id, subjectId: rows[0].subject_id,
        attempts: rows[0].attempts + 1, maxAttempts: rows[0].max_attempts,
        payload: typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload,
        leaseOwner: owner, leaseExpiresAt: leaseExpiresAt.toISOString()
      }
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  async heartbeat(job) {
    const [result] = await this.pool.execute(
      `UPDATE assessment_jobs SET lease_expires_at=?, updated_at=UTC_TIMESTAMP(3)
       WHERE job_id=? AND status='leased' AND lease_owner=?`,
      [toMysqlDate(new Date(this.now() + this.leaseMs)), job.jobId, job.leaseOwner]
    )
    if (result.affectedRows !== 1) throw new Error('ASSESSMENT_JOB_LEASE_LOST')
  }
  async complete(job) {
    await this.pool.execute(
      `UPDATE assessment_jobs SET status='completed', lease_owner=NULL, lease_expires_at=NULL,
       updated_at=UTC_TIMESTAMP(3) WHERE job_id=? AND lease_owner=?`, [job.jobId, job.leaseOwner]
    )
  }
  async fail(job, errorCode) {
    const retry = job.attempts < job.maxAttempts
    const delayMs = Math.min(5 * 60 * 1000, 5000 * (2 ** Math.max(0, job.attempts - 1)))
    await this.pool.execute(
      `UPDATE assessment_jobs SET status=?, next_attempt_at=?, lease_owner=NULL, lease_expires_at=NULL,
       error_code=?, updated_at=UTC_TIMESTAMP(3) WHERE job_id=? AND lease_owner=?`,
      [retry ? 'queued' : 'failed', toMysqlDate(new Date(this.now() + delayMs)), errorCode, job.jobId, job.leaseOwner]
    )
    return retry
  }
  async cancel(taskId) {
    await this.pool.execute(
      `UPDATE assessment_jobs SET status='cancelled', lease_owner=NULL, lease_expires_at=NULL,
       updated_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status IN ('queued','leased','failed')`, [taskId]
    )
  }
}

class QueueAssessmentGateway {
  constructor({ queue, repository }) { this.queue = queue; this.repository = repository }
  start(task) { return this.queue.enqueue(task) }
  get(taskId) { return this.repository.getTask(taskId) }
  async cancel(taskId) {
    await this.queue.cancel(taskId)
    const task = await this.repository.getTask(taskId)
    return task ? { ...task, status: 'cancelled', progressStage: 'finished' } : { taskId, status: 'cancelled' }
  }
}

module.exports = { MySqlAssessmentQueue, QueueAssessmentGateway }
