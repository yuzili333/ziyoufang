import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { validateTaskStateMachine } from './validate-task-state-machine.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const machine = readJson('harness/contracts/assessment-task-state-machine.json')
const schema = readJson('harness/contracts/assessment-result.schema.json')
const clone = (value) => structuredClone(value)

test('current task state machine matches the V2 result schema', () => {
  assert.deepEqual(validateTaskStateMachine(machine, schema), [])
})

test('terminal states reject outgoing transitions', () => {
  const changed = clone(machine)
  changed.transitions.push({
    id: 'T99_ILLEGAL', from: 'completed', to: 'analyzing', trigger: 'illegal',
    guards: ['none'], actions: ['persist_analysis_checkpoint']
  })
  assert.ok(validateTaskStateMachine(changed, schema).includes('completed must not have outgoing transitions'))
})

test('partial completion transition is mandatory', () => {
  const changed = clone(machine)
  changed.transitions = changed.transitions.filter((item) => item.id !== 'T08_ANALYSIS_PARTIAL')
  assert.ok(validateTaskStateMachine(changed, schema).includes('missing required transition: T08_ANALYSIS_PARTIAL'))
})

test('retry must preserve the idempotency key', () => {
  const changed = clone(machine)
  const retry = changed.transitions.find((item) => item.id === 'T11_RETRY_UPLOAD')
  retry.actions = retry.actions.filter((action) => action !== 'reuse_idempotency_key')
  assert.ok(validateTaskStateMachine(changed, schema).some((item) => item.includes('retry must reuse')))
})

test('model advice stage can be skipped but deterministic pipeline still persists', () => {
  const changed = clone(machine)
  changed.progressTransitions = changed.progressTransitions.filter(
    ([from, to]) => !(from === 'comparing' && to === 'persisting_result')
  )
  assert.ok(validateTaskStateMachine(changed, schema).includes(
    'missing progress transition: comparing->persisting_result'
  ))
})

test('legacy local_pending token is rejected', () => {
  const changed = clone(machine)
  changed.states.local_pending = changed.states.pending_local
  assert.ok(validateTaskStateMachine(changed, schema).includes(
    'legacy local_pending token is forbidden; use pending_local'
  ))
})
