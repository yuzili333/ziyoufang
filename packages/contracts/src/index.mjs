import { readFileSync } from 'node:fs'

const load = (relativePath) => JSON.parse(
  readFileSync(new URL(`../generated/${relativePath}`, import.meta.url), 'utf8')
)

export const assessmentResultSchema = load('assessment-result.schema.json')
export const characterGrowthSchema = load('character-growth.schema.json')
export const modelAdviceSchema = load('model-advice.schema.json')
export const assessmentTaskStateMachine = load('assessment-task-state-machine.json')
export const cloudDataModel = load('cloud-data-model.json')
export const syntheticAssessmentFixture = load('fixtures/assessment-result-v2.contract.json')
export const syntheticGrowthFixture = load('fixtures/character-growth-v1.contract.json')

export const TASK_STATUSES = Object.freeze([...assessmentResultSchema.properties.status.enum])
export const PROGRESS_STAGES = Object.freeze([...assessmentResultSchema.properties.progressStage.enum])
export const CHARACTER_CATEGORIES = Object.freeze([
  ...assessmentResultSchema.$defs.characterResult.properties.category.enum
])
