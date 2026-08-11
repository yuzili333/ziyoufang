const fixture = require('../fixtures/assessment-result-v2.contract.json')

class FixtureGateway {
  constructor() {
    this.calls = 0
    this.results = new Map()
  }

  async start(task) {
    this.calls += 1
    const result = structuredClone(fixture)
    result.taskId = task.taskId
    result.localTaskId = task.localTaskId
    result.idempotencyKey = task.idempotencyKey
    result.subjectId = task.subjectId
    result.updatedAt = new Date().toISOString()
    this.results.set(task.taskId, result)
    return { taskId: task.taskId, status: 'analyzing', progressStage: 'quality_checking' }
  }

  async get(taskId) {
    const result = this.results.get(taskId)
    if (!result) throw new Error('TASK_NOT_FOUND')
    return structuredClone(result)
  }

  async cancel(taskId) {
    return { taskId, status: 'cancelled', progressStage: 'finished' }
  }
}

module.exports = { FixtureGateway }
