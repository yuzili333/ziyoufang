import { syntheticAssessmentFixture } from '../../../packages/contracts/src/index.mjs'

export class FixtureAssessmentProvider {
  constructor({ enabled = process.env.ASSESSMENT_PROVIDER_MODE === 'fixture' } = {}) {
    this.enabled = enabled
    this.name = 'fixture'
  }

  async assess(task) {
    if (!this.enabled) throw new Error('FIXTURE_PROVIDER_DISABLED')
    const result = structuredClone(syntheticAssessmentFixture)
    result.taskId = task.taskId
    result.localTaskId = task.localTaskId
    result.idempotencyKey = task.idempotencyKey
    result.resultVersion = task.resultVersion ?? 1
    return {
      result,
      usage: {
        provider: this.name,
        operation: 'synthetic_assessment',
        inputUnits: 0,
        outputUnits: 0,
        costMicros: 0,
        cacheHit: true
      }
    }
  }
}
