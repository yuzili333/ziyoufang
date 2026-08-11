#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const METRICS = [
  'segmentationRecall',
  'ocrTop1Accuracy',
  'wrongPrecision',
  'wrongRecall',
  'correctionAgreement',
  'adviceActionability',
  'stabilityReasonableness',
  'p95LatencyMs',
  'costPerAssessmentCny'
]
export const APPROVERS = ['product', 'backendAlgorithm', 'test']

const isIsoDateTime = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && value.includes('T')

export function validatePocPlan(plan) {
  const errors = []
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return ['POC plan must be an object']
  if (plan.schemaVersion !== '1.0.0') errors.push('schemaVersion must be 1.0.0')
  if (plan.prototypeVersion !== 'mobile-v2-option-2-growth-v2') {
    errors.push('prototypeVersion must match mobile-v2')
  }
  if (!['pending', 'approved', 'rejected'].includes(plan.status)) errors.push('status is invalid')
  if (!isIsoDateTime(plan.updatedAt)) errors.push('updatedAt must be an ISO date-time')
  if (!Array.isArray(plan.datasets) || plan.datasets.length === 0) {
    errors.push('datasets must contain at least one entry')
  } else {
    const ids = new Set()
    for (const [index, dataset] of plan.datasets.entries()) {
      const prefix = `datasets[${index}]`
      if (!dataset || typeof dataset !== 'object' || Array.isArray(dataset)) {
        errors.push(`${prefix} must be an object`)
        continue
      }
      if (typeof dataset.id !== 'string' || !dataset.id.trim()) errors.push(`${prefix}.id is required`)
      if (ids.has(dataset.id)) errors.push(`${prefix}.id is duplicated`)
      ids.add(dataset.id)
      if (!['synthetic', 'deidentified', 'authorized'].includes(dataset.sourceType)) {
        errors.push(`${prefix}.sourceType is invalid`)
      }
      if (!['smoke', 'calibration', 'validation'].includes(dataset.usage)) {
        errors.push(`${prefix}.usage is invalid`)
      }
      if (typeof dataset.containsPersonalData !== 'boolean') {
        errors.push(`${prefix}.containsPersonalData must be boolean`)
      }
      if (typeof dataset.manifestPath !== 'string' || !dataset.manifestPath.trim()) {
        errors.push(`${prefix}.manifestPath is required`)
      }
      if (!Array.isArray(dataset.files) || dataset.files.length === 0) {
        errors.push(`${prefix}.files must not be empty`)
      } else {
        for (const [fileIndex, file] of dataset.files.entries()) {
          if (typeof file.path !== 'string' || !file.path.trim()) {
            errors.push(`${prefix}.files[${fileIndex}].path is required`)
          }
          if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
            errors.push(`${prefix}.files[${fileIndex}].sha256 is invalid`)
          }
        }
      }
    }
  }
  if (!plan.metrics || typeof plan.metrics !== 'object') {
    errors.push('metrics must be an object')
  } else {
    for (const name of METRICS) {
      const metric = plan.metrics[name]
      if (!metric || typeof metric !== 'object') {
        errors.push(`missing metric: ${name}`)
        continue
      }
      if (metric.target !== null && (typeof metric.target !== 'number' || !Number.isFinite(metric.target))) {
        errors.push(`${name}.target must be null or finite number`)
      }
      if (!['at_least', 'at_most'].includes(metric.direction)) errors.push(`${name}.direction is invalid`)
      if (typeof metric.unit !== 'string' || !metric.unit.trim()) errors.push(`${name}.unit is required`)
      if (typeof metric.approved !== 'boolean') errors.push(`${name}.approved must be boolean`)
    }
  }
  if (!plan.approvals || typeof plan.approvals !== 'object') {
    errors.push('approvals must be an object')
  } else {
    for (const role of APPROVERS) {
      const approval = plan.approvals[role]
      if (!approval || typeof approval !== 'object') {
        errors.push(`missing approval: ${role}`)
        continue
      }
      if (!['pending', 'approve', 'revise'].includes(approval.decision)) {
        errors.push(`${role}.decision is invalid`)
      }
      if (approval.reviewer !== null &&
        (typeof approval.reviewer !== 'string' || !approval.reviewer.trim())) {
        errors.push(`${role}.reviewer must be null or non-empty text`)
      }
      if (approval.reviewedAt !== null && !isIsoDateTime(approval.reviewedAt)) {
        errors.push(`${role}.reviewedAt must be null or ISO date-time`)
      }
      if (!Array.isArray(approval.evidence)) errors.push(`${role}.evidence must be an array`)
    }
  }
  return errors
}

export function evaluatePocPlan(plan, root) {
  const validationErrors = validatePocPlan(plan)
  if (validationErrors.length) {
    return { ready: false, code: 'invalid_poc_plan', validationErrors, blockers: [] }
  }
  const blockers = []
  const hashMismatches = []
  for (const dataset of plan.datasets) {
    for (const file of dataset.files) {
      try {
        const actual = createHash('sha256').update(readFileSync(resolve(root, file.path))).digest('hex')
        if (actual !== file.sha256) hashMismatches.push(`${file.path}: sha256 mismatch`)
      } catch {
        hashMismatches.push(`${file.path}: file is missing`)
      }
    }
  }
  blockers.push(...hashMismatches)

  const validationDatasets = plan.datasets.filter((dataset) => dataset.usage === 'validation')
  if (validationDatasets.length === 0) blockers.push('no validation dataset is approved')
  for (const dataset of validationDatasets) {
    if (dataset.sourceType === 'synthetic') {
      blockers.push(`${dataset.id}: synthetic data cannot be the only production-calibration evidence`)
    }
    if (!dataset.authorizationEvidence) {
      blockers.push(`${dataset.id}: authorizationEvidence is missing`)
    }
  }

  for (const name of METRICS) {
    const metric = plan.metrics[name]
    if (metric.target === null) blockers.push(`${name}: target is pending`)
    if (!metric.approved) blockers.push(`${name}: target is not approved`)
  }
  for (const role of APPROVERS) {
    const approval = plan.approvals[role]
    if (approval.decision !== 'approve') blockers.push(`${role}: approval is ${approval.decision}`)
    if (approval.decision === 'approve') {
      if (!approval.reviewer) blockers.push(`${role}: reviewer is missing`)
      if (!approval.reviewedAt) blockers.push(`${role}: reviewedAt is missing`)
      if (approval.evidence.length === 0) blockers.push(`${role}: evidence is missing`)
    }
  }
  if (plan.status !== 'approved') blockers.push(`status is ${plan.status}, expected approved`)

  return {
    ready: blockers.length === 0,
    code: blockers.length === 0 ? 'poc_inputs_ready' : 'poc_inputs_pending',
    validationErrors,
    blockers,
    datasetSummary: {
      total: plan.datasets.length,
      smoke: plan.datasets.filter((dataset) => dataset.usage === 'smoke').length,
      calibration: plan.datasets.filter((dataset) => dataset.usage === 'calibration').length,
      validation: validationDatasets.length
    },
    hashMismatches
  }
}

async function main() {
  const args = process.argv.slice(2)
  const jsonOutput = args.includes('--json')
  const requireReady = args.includes('--require-ready')
  const recordArg = args.find((arg) => !arg.startsWith('--'))
  const root = resolve(import.meta.dirname, '..', '..')
  const planPath = resolve(root, recordArg ?? 'harness/validation/poc-evaluation-plan.json')
  const plan = JSON.parse(readFileSync(planPath, 'utf8'))
  const result = evaluatePocPlan(plan, root)
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ready) {
    console.log('POC inputs: READY')
  } else {
    console.log('POC inputs: PENDING')
    for (const blocker of [...result.validationErrors, ...result.blockers]) console.log(`- ${blocker}`)
  }
  if (result.validationErrors.length || (requireReady && !result.ready)) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
