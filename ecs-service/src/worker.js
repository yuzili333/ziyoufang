const { randomUUID } = require('node:crypto')
const { bootstrap } = require('./bootstrap')
const { SynchronousAssessmentClient } = require('./assessment-client')
const { ExpirationCleanup } = require('./cleanup')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function processJob({ job, dependencies, client }) {
  const { queue, repository, media, config } = dependencies
  const heartbeat = setInterval(() => queue.heartbeat(job).catch(() => undefined), config.heartbeatMs)
  try {
    const task = await repository.getTask(job.taskId)
    if (!task || task.status === 'cancelled') { await queue.cancel(job.taskId); return }
    const mediaAccess = await media.createAccess(task.cloudFileId)
    const result = await client.run({ ...job.payload, mediaAccess })
    const latest = await repository.getTask(job.taskId)
    if (latest?.status !== 'cancelled') {
      await repository.saveResult(job.taskId, { ...result, subjectId: job.subjectId, updatedAt: new Date().toISOString() })
    }
    await queue.complete(job)
  } catch (error) {
    const retrying = await queue.fail(job, String(error.message).slice(0, 128))
    if (!retrying) await repository.updateTask(job.taskId, {
      status: 'failed', progressStage: 'finished', retryable: true,
      errorCode: String(error.message).slice(0, 128), updatedAt: new Date().toISOString()
    })
  } finally { clearInterval(heartbeat) }
}

async function main() {
  const dependencies = bootstrap()
  const owner = `worker_${randomUUID()}`
  const client = new SynchronousAssessmentClient({
    baseUrl: dependencies.config.assessmentServiceBaseUrl,
    secret: dependencies.config.secrets.bffHmac
  })
  const cleanup = new ExpirationCleanup(dependencies)
  let stopped = false
  process.once('SIGTERM', () => { stopped = true })
  process.once('SIGINT', () => { stopped = true })
  let nextCleanup = 0
  while (!stopped) {
    if (Date.now() >= nextCleanup) {
      await cleanup.run().catch((error) => console.error(`cleanup:${error.message}`))
      nextCleanup = Date.now() + 60 * 60 * 1000
    }
    const job = await dependencies.queue.claim(owner)
    if (!job) { await delay(1000); continue }
    await processJob({ job, dependencies, client })
  }
  await dependencies.pool.end()
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1) })

module.exports = { processJob }
