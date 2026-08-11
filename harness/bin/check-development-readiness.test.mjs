import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  REQUIRED_ROLES,
  evaluateReviewDecision,
  validateReviewDecision
} from './check-development-readiness.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const currentRecord = JSON.parse(
  readFileSync(resolve(root, 'harness/reviews/mobile-v2-review-decision.json'), 'utf8')
)
const clone = (value) => structuredClone(value)
const pendingRecord = () => {
  const record = clone(currentRecord)
  record.reviewStatus = 'pending'
  record.issues = []
  for (const role of REQUIRED_ROLES) {
    record.roles[role] = { decision: 'pending', reviewer: null, reviewedAt: null, evidence: [] }
  }
  return record
}

const approveAll = (record) => {
  record.reviewStatus = 'approved'
  for (const role of REQUIRED_ROLES) {
    record.roles[role] = {
      decision: 'approve',
      reviewer: `${role}-reviewer`,
      reviewedAt: '2026-08-11T12:00:00.000Z',
      evidence: ['harness/reviews/mobile-v2-joint-review-packet.md']
    }
  }
  return record
}

test('pending six-role record is valid but not ready', () => {
  const record = pendingRecord()
  assert.deepEqual(validateReviewDecision(record), [])
  const result = evaluateReviewDecision(record)
  assert.equal(result.ready, false)
  assert.equal(result.code, 'review_not_ready')
  assert.equal(result.blockers.filter((item) => item.includes('decision is pending')).length, 6)
})

test('six approved roles and zero blockers are ready', () => {
  const record = approveAll(pendingRecord())
  const result = evaluateReviewDecision(record)
  assert.equal(result.ready, true)
  assert.equal(result.code, 'ready_for_implementation_transition')
  assert.equal(result.issueSummary.openBlocking, 0)
})

test('open P1 issue blocks an otherwise approved record', () => {
  const record = approveAll(pendingRecord())
  record.issues.push({
    id: 'REV-FLOW-01',
    severity: 'P1',
    title: '主流程仍有歧义',
    status: 'open',
    ownerRole: 'product',
    owner: 'product-owner',
    targetDate: '2026-08-20',
    closureEvidence: null
  })
  const result = evaluateReviewDecision(record)
  assert.equal(result.ready, false)
  assert.ok(result.blockers.includes('REV-FLOW-01: open P1 issue'))
})

test('nonblocking approval requires an owned P3 follow-up', () => {
  const record = approveAll(pendingRecord())
  record.roles.client.decision = 'approve_with_nonblocking_followups'
  const missingFollowup = evaluateReviewDecision(record)
  assert.equal(missingFollowup.ready, false)
  assert.ok(missingFollowup.blockers.some((item) => item.includes('no owned P3 follow-up')))

  record.issues.push({
    id: 'REV-POLISH-01',
    severity: 'P3',
    title: '补充长文案真机检查',
    status: 'open',
    ownerRole: 'client',
    owner: 'client-owner',
    targetDate: '2026-08-25',
    closureEvidence: null
  })
  const withFollowup = evaluateReviewDecision(record)
  assert.equal(withFollowup.ready, true)
  assert.equal(withFollowup.issueSummary.openNonblocking, 1)
})

test('closed issue without evidence is structurally invalid', () => {
  const record = approveAll(pendingRecord())
  record.issues.push({
    id: 'REV-CLOSED-01',
    severity: 'P2',
    title: '已关闭问题',
    status: 'closed',
    ownerRole: 'test',
    owner: 'test-owner',
    targetDate: '2026-08-11',
    closureEvidence: null
  })
  assert.ok(validateReviewDecision(record).some((item) => item.includes('without closureEvidence')))
  assert.equal(evaluateReviewDecision(record).code, 'invalid_review_record')
})
