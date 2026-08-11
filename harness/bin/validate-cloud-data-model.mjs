#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..', '..')
const EXPECTED_COLLECTIONS = [
  'subject_accounts',
  'consent_records',
  'media_objects',
  'assessment_tasks',
  'character_results',
  'wordbook_entries',
  'growth_segments',
  'monitoring_events',
  'feedback_records',
  'share_cards',
  'deletion_jobs',
  'audit_events'
]
const DELETION_REQUIRED = [
  'media_objects',
  'assessment_tasks',
  'character_results',
  'wordbook_entries',
  'growth_segments',
  'monitoring_events',
  'feedback_records',
  'share_cards'
]
const REQUIRED_FORBIDDEN_FIELDS = [
  'openid',
  'sessionKey',
  'ocrApiSecret',
  'modelApiKey',
  'publicImageUrl',
  'rawShareToken',
  'fullModelPrompt'
]

const hasIndex = (collection, fields) =>
  collection.uniqueIndexes.some((index) => JSON.stringify(index) === JSON.stringify(fields))

export function validateCloudDataModel(model) {
  const errors = []
  const collections = model.collections ?? []
  const ids = collections.map((collection) => collection.id)
  if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_COLLECTIONS)) {
    errors.push('collection order and values do not match the MVP storage model')
  }
  if (model.tenantBoundary?.tenantKey !== 'subjectId') errors.push('tenant key must be subjectId')
  if (model.tenantBoundary?.clientSuppliedOpenidTrusted !== false) {
    errors.push('client-supplied openid must never be trusted')
  }
  if (model.tenantBoundary?.directClientDatabaseWrite !== false) {
    errors.push('direct client database writes must be disabled')
  }

  for (const collection of collections) {
    if (collection.tenantKey !== 'subjectId') errors.push(`${collection.id}: tenantKey must be subjectId`)
    if (!collection.requiredFields.includes('subjectId')) errors.push(`${collection.id}: subjectId is required`)
    if (!collection.requiredFields.includes(collection.primaryKey)) {
      errors.push(`${collection.id}: primary key must be required`)
    }
    if (!Array.isArray(collection.uniqueIndexes) || collection.uniqueIndexes.length === 0) {
      errors.push(`${collection.id}: at least one unique index is required`)
    }
    if (collection.access.clientWrite === 'direct') errors.push(`${collection.id}: direct client write is forbidden`)
    if (String(collection.access.clientRead).includes('public')) {
      errors.push(`${collection.id}: public reads are forbidden`)
    }
    if (collection.containsMedia && collection.lifecycle.ttlField !== 'expiresAt') {
      errors.push(`${collection.id}: media requires expiresAt TTL`)
    }
    for (const field of collection.requiredFields) {
      if (REQUIRED_FORBIDDEN_FIELDS.includes(field)) errors.push(`${collection.id}: forbidden field ${field}`)
    }
  }

  const byId = Object.fromEntries(collections.map((collection) => [collection.id, collection]))
  if (!hasIndex(byId.assessment_tasks ?? { uniqueIndexes: [] }, ['subjectId', 'idempotencyKey'])) {
    errors.push('assessment_tasks lacks subjectId+idempotencyKey uniqueness')
  }
  if (!hasIndex(byId.character_results ?? { uniqueIndexes: [] }, ['taskId', 'resultVersion', 'characterIndex'])) {
    errors.push('character_results lacks result idempotency index')
  }
  if (!hasIndex(byId.wordbook_entries ?? { uniqueIndexes: [] }, ['subjectId', 'targetCharacter'])) {
    errors.push('wordbook_entries lacks one-entry-per-character index')
  }
  if (!hasIndex(byId.growth_segments ?? { uniqueIndexes: [] }, ['subjectId', 'targetCharacter', 'scoreVersion', 'glyphVersion'])) {
    errors.push('growth_segments lacks version segmentation index')
  }
  if (byId.share_cards?.requiredFields.includes('rawShareToken')) {
    errors.push('share_cards must store only shareTokenHash')
  }
  if (!byId.share_cards?.requiredFields.includes('redactedPayload')) {
    errors.push('share_cards must persist only a redacted payload')
  }
  if (byId.audit_events?.appendOnly !== true || byId.consent_records?.appendOnly !== true) {
    errors.push('audit and consent records must be append-only')
  }
  for (const collectionId of DELETION_REQUIRED) {
    if (!(model.deletionCoverage ?? []).includes(collectionId)) {
      errors.push(`deletion coverage misses ${collectionId}`)
    }
  }
  for (const field of REQUIRED_FORBIDDEN_FIELDS) {
    if (!(model.forbiddenStoredFields ?? []).includes(field)) {
      errors.push(`forbiddenStoredFields misses ${field}`)
    }
  }
  if (model.writeInvariants?.uncertainAndFailedExcludedFromWordbook !== true) {
    errors.push('uncertain and failed results must be excluded from wordbook')
  }
  if (model.writeInvariants?.growthRequiresComparableVersionSegment !== true) {
    errors.push('growth must be segmented by comparable versions')
  }
  return errors
}

async function main() {
  const model = JSON.parse(readFileSync(resolve(root, 'harness/contracts/cloud-data-model.json'), 'utf8'))
  const errors = validateCloudDataModel(model)
  if (errors.length) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
  } else {
    console.log('cloud data model is consistent')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
