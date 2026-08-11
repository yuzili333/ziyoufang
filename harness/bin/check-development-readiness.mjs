#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export const REQUIRED_ROLES = [
  'product',
  'interaction_visual',
  'client',
  'backend_algorithm',
  'test',
  'privacy_compliance'
]

const ALLOWED_DECISIONS = new Set([
  'pending',
  'approve',
  'approve_with_nonblocking_followups',
  'revise'
])
const ALLOWED_REVIEW_STATUSES = new Set(['pending', 'approved', 'revise'])
const ALLOWED_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3'])
const BLOCKING_SEVERITIES = new Set(['P0', 'P1', 'P2'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isIsoDateTime = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && value.includes('T')

export function validateReviewDecision(record) {
  const errors = []
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return ['review decision must be an object']
  }
  if (record.schemaVersion !== '1.0.0') errors.push('schemaVersion must be 1.0.0')
  if (record.prototypeVersion !== 'mobile-v2-option-2-growth-v2') {
    errors.push('prototypeVersion must match the locked mobile-v2 visual')
  }
  if (!ALLOWED_REVIEW_STATUSES.has(record.reviewStatus)) {
    errors.push('reviewStatus is invalid')
  }
  if (!isIsoDateTime(record.updatedAt)) errors.push('updatedAt must be an ISO date-time')
  if (!record.roles || typeof record.roles !== 'object' || Array.isArray(record.roles)) {
    errors.push('roles must be an object')
  } else {
    const actualRoles = Object.keys(record.roles)
    for (const role of REQUIRED_ROLES) {
      const value = record.roles[role]
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`missing role decision: ${role}`)
        continue
      }
      if (!ALLOWED_DECISIONS.has(value.decision)) errors.push(`${role}.decision is invalid`)
      if (value.reviewer !== null && (typeof value.reviewer !== 'string' || !value.reviewer.trim())) {
        errors.push(`${role}.reviewer must be null or non-empty text`)
      }
      if (value.reviewedAt !== null && !isIsoDateTime(value.reviewedAt)) {
        errors.push(`${role}.reviewedAt must be null or an ISO date-time`)
      }
      if (!Array.isArray(value.evidence) || value.evidence.some((item) => typeof item !== 'string' || !item.trim())) {
        errors.push(`${role}.evidence must contain non-empty paths`)
      }
    }
    for (const role of actualRoles) {
      if (!REQUIRED_ROLES.includes(role)) errors.push(`unknown role: ${role}`)
    }
  }
  if (!Array.isArray(record.issues)) {
    errors.push('issues must be an array')
  } else {
    const issueIds = new Set()
    for (const [index, issue] of record.issues.entries()) {
      const prefix = `issues[${index}]`
      if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
        errors.push(`${prefix} must be an object`)
        continue
      }
      if (typeof issue.id !== 'string' || !/^REV-[A-Z0-9-]+$/.test(issue.id)) {
        errors.push(`${prefix}.id is invalid`)
      } else if (issueIds.has(issue.id)) {
        errors.push(`${prefix}.id is duplicated`)
      } else {
        issueIds.add(issue.id)
      }
      if (!ALLOWED_SEVERITIES.has(issue.severity)) errors.push(`${prefix}.severity is invalid`)
      if (typeof issue.title !== 'string' || !issue.title.trim()) errors.push(`${prefix}.title is required`)
      if (!['open', 'closed'].includes(issue.status)) errors.push(`${prefix}.status is invalid`)
      if (!REQUIRED_ROLES.includes(issue.ownerRole)) errors.push(`${prefix}.ownerRole is invalid`)
      if (issue.owner !== null && (typeof issue.owner !== 'string' || !issue.owner.trim())) {
        errors.push(`${prefix}.owner must be null or non-empty text`)
      }
      if (issue.targetDate !== null && (typeof issue.targetDate !== 'string' || !ISO_DATE.test(issue.targetDate))) {
        errors.push(`${prefix}.targetDate must be null or YYYY-MM-DD`)
      }
      if (issue.closureEvidence !== null &&
        (typeof issue.closureEvidence !== 'string' || !issue.closureEvidence.trim())) {
        errors.push(`${prefix}.closureEvidence must be null or non-empty text`)
      }
      if (issue.status === 'closed' && !issue.closureEvidence) {
        errors.push(`${prefix} is closed without closureEvidence`)
      }
    }
  }
  return errors
}

export function evaluateReviewDecision(record) {
  const validationErrors = validateReviewDecision(record)
  if (validationErrors.length) {
    return {
      ready: false,
      code: 'invalid_review_record',
      validationErrors,
      blockers: []
    }
  }

  const blockers = []
  for (const role of REQUIRED_ROLES) {
    const value = record.roles[role]
    if (value.decision === 'pending') blockers.push(`${role}: decision is pending`)
    if (value.decision === 'revise') blockers.push(`${role}: requested revision`)
    if (['approve', 'approve_with_nonblocking_followups'].includes(value.decision)) {
      if (!value.reviewer) blockers.push(`${role}: reviewer is missing`)
      if (!value.reviewedAt) blockers.push(`${role}: reviewedAt is missing`)
      if (value.evidence.length === 0) blockers.push(`${role}: evidence is missing`)
    }
    if (value.decision === 'approve_with_nonblocking_followups') {
      const ownedFollowup = record.issues.some((issue) =>
        issue.status === 'open' && issue.severity === 'P3' && issue.ownerRole === role &&
        issue.owner && issue.targetDate
      )
      if (!ownedFollowup) blockers.push(`${role}: nonblocking approval has no owned P3 follow-up`)
    }
  }

  for (const issue of record.issues) {
    if (issue.status === 'open' && BLOCKING_SEVERITIES.has(issue.severity)) {
      blockers.push(`${issue.id}: open ${issue.severity} issue`)
    }
    if (issue.status === 'open' && issue.severity === 'P3' && (!issue.owner || !issue.targetDate)) {
      blockers.push(`${issue.id}: open P3 issue needs owner and targetDate`)
    }
  }

  if (record.reviewStatus !== 'approved') {
    blockers.push(`reviewStatus is ${record.reviewStatus}, expected approved`)
  }

  return {
    ready: blockers.length === 0,
    code: blockers.length === 0 ? 'ready_for_implementation_transition' : 'review_not_ready',
    validationErrors,
    blockers,
    roleSummary: Object.fromEntries(
      REQUIRED_ROLES.map((role) => [role, record.roles[role].decision])
    ),
    issueSummary: {
      total: record.issues.length,
      openBlocking: record.issues.filter((issue) =>
        issue.status === 'open' && BLOCKING_SEVERITIES.has(issue.severity)
      ).length,
      openNonblocking: record.issues.filter((issue) =>
        issue.status === 'open' && issue.severity === 'P3'
      ).length
    }
  }
}

function renderText(result) {
  if (result.validationErrors.length) {
    return [
      'development readiness: INVALID',
      ...result.validationErrors.map((error) => `- ${error}`)
    ].join('\n')
  }
  if (result.ready) {
    return 'development readiness: READY_FOR_IMPLEMENTATION_TRANSITION'
  }
  return [
    'development readiness: PENDING',
    ...result.blockers.map((blocker) => `- ${blocker}`)
  ].join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const jsonOutput = args.includes('--json')
  const requireReady = args.includes('--require-ready')
  const recordArg = args.find((arg) => !arg.startsWith('--'))
  const root = resolve(import.meta.dirname, '..', '..')
  const recordPath = resolve(root, recordArg ?? 'harness/reviews/mobile-v2-review-decision.json')
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const result = evaluateReviewDecision(record)
  console.log(jsonOutput ? JSON.stringify(result, null, 2) : renderText(result))
  if (result.validationErrors.length || (requireReady && !result.ready)) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
