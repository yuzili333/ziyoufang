import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { validateCloudDataModel } from './validate-cloud-data-model.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const model = JSON.parse(readFileSync(resolve(root, 'harness/contracts/cloud-data-model.json'), 'utf8'))
const clone = (value) => structuredClone(value)
const collection = (value, id) => value.collections.find((item) => item.id === id)

test('current cloud data model satisfies MVP isolation and lifecycle rules', () => {
  assert.deepEqual(validateCloudDataModel(model), [])
})

test('every collection must be tenant-scoped', () => {
  const changed = clone(model)
  collection(changed, 'character_results').tenantKey = 'taskId'
  assert.ok(validateCloudDataModel(changed).includes('character_results: tenantKey must be subjectId'))
})

test('assessment task idempotency index is mandatory', () => {
  const changed = clone(model)
  collection(changed, 'assessment_tasks').uniqueIndexes = [['subjectId', 'localTaskId']]
  assert.ok(validateCloudDataModel(changed).includes(
    'assessment_tasks lacks subjectId+idempotencyKey uniqueness'
  ))
})

test('media requires an expiration field and cannot be public', () => {
  const changed = clone(model)
  const media = collection(changed, 'media_objects')
  media.lifecycle.ttlField = null
  media.access.clientRead = 'public'
  const errors = validateCloudDataModel(changed)
  assert.ok(errors.includes('media_objects: media requires expiresAt TTL'))
  assert.ok(errors.includes('media_objects: public reads are forbidden'))
})

test('deletion must cover growth and share artifacts', () => {
  const changed = clone(model)
  changed.deletionCoverage = changed.deletionCoverage.filter(
    (id) => !['growth_segments', 'share_cards'].includes(id)
  )
  const errors = validateCloudDataModel(changed)
  assert.ok(errors.includes('deletion coverage misses growth_segments'))
  assert.ok(errors.includes('deletion coverage misses share_cards'))
})

test('raw openid and share tokens are forbidden stored fields', () => {
  const changed = clone(model)
  collection(changed, 'subject_accounts').requiredFields.push('openid')
  collection(changed, 'share_cards').requiredFields.push('rawShareToken')
  const errors = validateCloudDataModel(changed)
  assert.ok(errors.includes('subject_accounts: forbidden field openid'))
  assert.ok(errors.includes('share_cards must store only shareTokenHash'))
})
