import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  CHARACTER_CATEGORIES,
  PROGRESS_STAGES,
  TASK_STATUSES,
  assessmentTaskStateMachine,
  cloudDataModel,
  syntheticAssessmentFixture
} from '../packages/contracts/src/index.mjs'

const root = resolve(import.meta.dirname, '..')
const hash = (path) => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')

test('generated contracts are exact copies of approved Harness sources', () => {
  const pairs = [
    ['harness/contracts/assessment-result.schema.json', 'packages/contracts/generated/assessment-result.schema.json'],
    ['harness/contracts/character-growth.schema.json', 'packages/contracts/generated/character-growth.schema.json'],
    ['harness/contracts/model-advice.schema.json', 'packages/contracts/generated/model-advice.schema.json'],
    ['harness/contracts/assessment-task-state-machine.json', 'packages/contracts/generated/assessment-task-state-machine.json'],
    ['harness/contracts/cloud-data-model.json', 'packages/contracts/generated/cloud-data-model.json'],
    ['harness/fixtures/expected/assessment-result-v2.contract.json', 'packages/contracts/generated/fixtures/assessment-result-v2.contract.json']
  ]
  for (const [source, generated] of pairs) assert.equal(hash(generated), hash(source), generated)
})

test('runtime constants preserve the approved task and result vocabulary', () => {
  assert.deepEqual(TASK_STATUSES, [
    'pending_local', 'uploading', 'analyzing', 'completed',
    'partially_completed', 'failed', 'cancelled'
  ])
  assert.equal(PROGRESS_STAGES.at(-1), 'finished')
  assert.deepEqual(CHARACTER_CATEGORIES, [
    'normal', 'wrong', 'needs_correction', 'uncertain', 'failed'
  ])
  assert.equal(assessmentTaskStateMachine.initialState, 'pending_local')
  assert.equal(cloudDataModel.tenantBoundary.directClientDatabaseWrite, false)
  assert.equal(syntheticAssessmentFixture.characters.length, syntheticAssessmentFixture.summary.total)
})
