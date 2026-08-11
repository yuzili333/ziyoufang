#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..', '..')
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))

export function validateTaskStateMachine(machine, assessmentSchema) {
  const errors = []
  if (JSON.stringify(machine).includes('local_pending')) {
    errors.push('legacy local_pending token is forbidden; use pending_local')
  }
  const schemaStates = assessmentSchema.properties.status.enum
  const schemaStages = assessmentSchema.properties.progressStage.enum
  const states = Object.keys(machine.states ?? {})
  if (JSON.stringify(states) !== JSON.stringify(schemaStates)) {
    errors.push('state order and values must match assessment-result.schema.json')
  }
  if (JSON.stringify(machine.progressStages) !== JSON.stringify(schemaStages)) {
    errors.push('progress stages must match assessment-result.schema.json')
  }
  if (machine.initialState !== 'pending_local') errors.push('initialState must be pending_local')

  const transitionIds = new Set()
  const outgoing = new Map(states.map((state) => [state, []]))
  for (const transition of machine.transitions ?? []) {
    if (transitionIds.has(transition.id)) errors.push(`duplicated transition id: ${transition.id}`)
    transitionIds.add(transition.id)
    if (!states.includes(transition.from)) errors.push(`${transition.id}: unknown from state`)
    if (!states.includes(transition.to)) errors.push(`${transition.id}: unknown to state`)
    if (!transition.trigger) errors.push(`${transition.id}: trigger is required`)
    if (!Array.isArray(transition.guards) || transition.guards.length === 0) {
      errors.push(`${transition.id}: guards are required`)
    }
    if (!Array.isArray(transition.actions) || transition.actions.length === 0) {
      errors.push(`${transition.id}: actions are required`)
    }
    outgoing.get(transition.from)?.push(transition)
    if (['completed', 'partially_completed', 'cancelled'].includes(transition.to) &&
      !transition.actions.includes(transition.to === 'cancelled' ? 'persist_cancel_once' : 'persist_terminal_state')) {
      errors.push(`${transition.id}: terminal transition lacks persistence action`)
    }
    if (['completed', 'partially_completed'].includes(transition.to) &&
      !transition.actions.includes('commit_result_once')) {
      errors.push(`${transition.id}: result terminal transition lacks commit_result_once`)
    }
    if (transition.id.includes('RETRY') && !transition.actions.includes('reuse_idempotency_key')) {
      errors.push(`${transition.id}: retry must reuse idempotency key`)
    }
  }

  for (const terminal of ['completed', 'partially_completed', 'cancelled']) {
    if ((outgoing.get(terminal) ?? []).length > 0) errors.push(`${terminal} must not have outgoing transitions`)
  }
  for (const requiredId of [
    'T03_NETWORK_RECOVERY',
    'T04_SERVER_ACCEPTED',
    'T08_ANALYSIS_PARTIAL',
    'T10_CANCEL_ANALYSIS',
    'T11_RETRY_UPLOAD',
    'T12_RETRY_ANALYSIS'
  ]) {
    if (!transitionIds.has(requiredId)) errors.push(`missing required transition: ${requiredId}`)
  }
  const cancelAnalysis = machine.transitions?.find((item) => item.id === 'T10_CANCEL_ANALYSIS')
  if (!cancelAnalysis?.guards.includes('before_persistence_commit')) {
    errors.push('analysis cancellation must stop before persistence commit')
  }

  const reachableTerminal = (start) => {
    const queue = [start]
    const visited = new Set()
    while (queue.length) {
      const state = queue.shift()
      if (['completed', 'partially_completed', 'cancelled'].includes(state)) return true
      if (visited.has(state)) continue
      visited.add(state)
      for (const transition of outgoing.get(state) ?? []) queue.push(transition.to)
    }
    return false
  }
  for (const state of ['pending_local', 'uploading', 'analyzing', 'failed']) {
    if (!reachableTerminal(state)) errors.push(`${state} cannot reach a terminal state`)
  }

  const stageEdges = new Set((machine.progressTransitions ?? []).map(([from, to]) => `${from}->${to}`))
  for (const [from, to] of machine.progressTransitions ?? []) {
    if (!schemaStages.includes(from) || !schemaStages.includes(to)) {
      errors.push(`unknown progress transition: ${from}->${to}`)
    }
  }
  for (const edge of [
    'quality_checking->segmenting',
    'segmenting->recognizing',
    'recognizing->comparing',
    'comparing->generating_advice',
    'comparing->persisting_result',
    'generating_advice->persisting_result',
    'persisting_result->finished'
  ]) {
    if (!stageEdges.has(edge)) errors.push(`missing progress transition: ${edge}`)
  }
  if (machine.progressRules?.activeStatus !== 'analyzing') {
    errors.push('progress stages must be owned by analyzing status')
  }
  if (machine.progressRules?.modelFailureBehavior !== 'remain_in_pipeline_and_use_template_advice') {
    errors.push('model failure must degrade without failing deterministic results')
  }

  const idempotency = machine.idempotency ?? {}
  if (idempotency.sameKeyReturnsSameTaskId !== true) errors.push('same key must return the same taskId')
  if (idempotency.retryCreatesNewLogicalTask !== false) errors.push('retry must not create a logical task')
  if (idempotency.feedbackReassessmentCreatesLinkedTask !== true) {
    errors.push('feedback reassessment must create a linked task')
  }
  if (machine.cancellation?.requestIsIdempotent !== true) errors.push('cancellation must be idempotent')
  if (machine.cancellation?.rejectAfterCheckpoint !== 'persistence_commit_started') {
    errors.push('cancellation checkpoint is not fixed')
  }
  return errors
}

export function assertTaskStateMachine(machine, assessmentSchema) {
  assert.deepEqual(validateTaskStateMachine(machine, assessmentSchema), [])
}

async function main() {
  const machine = readJson('harness/contracts/assessment-task-state-machine.json')
  const schema = readJson('harness/contracts/assessment-result.schema.json')
  const errors = validateTaskStateMachine(machine, schema)
  if (errors.length) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
  } else {
    console.log('assessment task state machine is consistent')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
