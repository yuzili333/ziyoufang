import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { APPROVERS, METRICS, evaluatePocPlan, validatePocPlan } from './check-poc-inputs.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const current = JSON.parse(readFileSync(resolve(root, 'harness/validation/poc-evaluation-plan.json'), 'utf8'))
const clone = (value) => structuredClone(value)

const approve = (plan) => {
  plan.status = 'approved'
  plan.datasets[0].usage = 'validation'
  plan.datasets[0].sourceType = 'authorized'
  plan.datasets[0].authorizationEvidence = 'harness/reviews/privacy-and-data-compliance.md'
  for (const name of METRICS) {
    plan.metrics[name].target = plan.metrics[name].direction === 'at_least' ? 0.8 : 1000
    plan.metrics[name].approved = true
  }
  for (const role of APPROVERS) {
    plan.approvals[role] = {
      decision: 'approve',
      reviewer: `${role}-reviewer`,
      reviewedAt: '2026-08-11T12:00:00.000Z',
      evidence: ['harness/validation/assessment-poc-plan.md']
    }
  }
  return plan
}

test('current synthetic smoke plan is valid but pending', () => {
  assert.deepEqual(validatePocPlan(current), [])
  const result = evaluatePocPlan(current, root)
  assert.equal(result.ready, false)
  assert.equal(result.code, 'poc_inputs_pending')
  assert.equal(result.hashMismatches.length, 0)
  assert.ok(result.blockers.includes('no validation dataset is approved'))
})

test('approved targets, evidence and validation dataset are ready', () => {
  const result = evaluatePocPlan(approve(clone(current)), root)
  assert.equal(result.ready, true)
  assert.equal(result.code, 'poc_inputs_ready')
})

test('missing metric target blocks POC inputs', () => {
  const plan = approve(clone(current))
  plan.metrics.wrongPrecision.target = null
  const result = evaluatePocPlan(plan, root)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.includes('wrongPrecision: target is pending'))
})

test('synthetic-only validation cannot approve production calibration', () => {
  const plan = approve(clone(current))
  plan.datasets[0].sourceType = 'synthetic'
  const result = evaluatePocPlan(plan, root)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.some((item) => item.includes('synthetic data cannot be')))
})

test('fixture hash mismatch is detected', () => {
  const plan = approve(clone(current))
  plan.datasets[0].files[0].sha256 = '0'.repeat(64)
  const result = evaluatePocPlan(plan, root)
  assert.equal(result.ready, false)
  assert.ok(result.hashMismatches[0].includes('sha256 mismatch'))
})
