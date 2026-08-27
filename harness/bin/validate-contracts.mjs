import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..')
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const readText = (path) => readFileSync(resolve(root, path), 'utf8')

const assessmentSchema = readJson('harness/contracts/assessment-result.schema.json')
const adviceSchema = readJson('harness/contracts/model-advice.schema.json')
const growthSchema = readJson('harness/contracts/character-growth.schema.json')
const responsiveLayout = readJson('harness/contracts/responsive-layout-v2.json')
const sample = readJson('harness/fixtures/expected/assessment-result-v2.contract.json')
const growthSample = readJson('harness/fixtures/expected/character-growth-v1.contract.json')
const api = readText('harness/contracts/assessment-api.md')

const taskStatuses = assessmentSchema.properties.status.enum
assert.deepEqual(taskStatuses, [
  'pending_local',
  'uploading',
  'analyzing',
  'completed',
  'partially_completed',
  'failed',
  'cancelled'
])

const stages = assessmentSchema.properties.progressStage.enum
for (const stage of [
  'quality_checking',
  'segmenting',
  'recognizing',
  'comparing',
  'generating_advice',
  'persisting_result'
]) {
  assert.ok(stages.includes(stage), `missing progress stage: ${stage}`)
}

const character = assessmentSchema.$defs.characterResult
assert.deepEqual(character.properties.category.enum, [
  'normal',
  'wrong',
  'needs_correction',
  'uncertain',
  'failed'
])
assert.equal(character.properties.correctionSteps.maxItems, 3)
assert.equal(character.properties.differenceAnnotations.maxItems, 3)
assert.deepEqual(character.properties.scoreBreakdown.required, [
  'strokeStandard',
  'frameStructure',
  'glyphProportion',
  'positionLayout',
  'stability'
])
assert.equal(adviceSchema.properties.items.maxItems, 8)
assert.equal(
  adviceSchema.properties.items.items.properties.correctionSteps.maxItems,
  3
)

for (const functionName of [
  'createUploadTask',
  'submitAssessment',
  'getAssessment',
  'getCharacterGrowth',
  'cancelAssessment',
  'submitStudentFeedback',
  'deletePractice',
  'createShareCard',
  'revokeShareCard'
]) {
  assert.ok(api.includes(`\`${functionName}\``), `missing cloud function draft: ${functionName}`)
}

assert.ok(taskStatuses.includes(sample.status), 'sample contains an unknown task status')
assert.ok(stages.includes(sample.progressStage), 'sample contains an unknown progress stage')
assert.equal(sample.summary.total, sample.characters.length)

const categoryCounts = {
  normal: 0,
  wrong: 0,
  needs_correction: 0,
  uncertain: 0,
  failed: 0
}

for (const item of sample.characters) {
  assert.ok(character.properties.category.enum.includes(item.category))
  assert.ok(item.correctionSteps.length <= 3)
  assert.equal(item.polygon.length, 4)
  assert.ok(item.differenceAnnotations.length <= 3)
  for (const annotation of item.differenceAnnotations) {
    assert.ok(annotation.code)
    assert.ok(['top', 'right', 'bottom', 'left', 'center', 'edge'].includes(annotation.anchor))
    assert.ok(annotation.label)
  }
  assert.deepEqual(Object.keys(item.scoreBreakdown), [
    'strokeStandard',
    'frameStructure',
    'glyphProportion',
    'positionLayout',
    'stability'
  ])
  assert.ok(['collecting', 'available', 'version_break'].includes(item.growthSummary.status))
  if (item.growthSummary.comparablePracticeCount < 3) {
    assert.equal(item.scoreBreakdown.stability, null)
    assert.equal(item.growthSummary.stabilityScore, null)
    assert.equal(item.growthSummary.monitoringStatus, 'not_eligible')
  }
  categoryCounts[item.category] += 1
}

assert.deepEqual(sample.summary, {
  total: sample.characters.length,
  normal: categoryCounts.normal,
  wrong: categoryCounts.wrong,
  needsCorrection: categoryCounts.needs_correction,
  uncertain: categoryCounts.uncertain,
  failed: categoryCounts.failed
})

assert.equal(growthSample.character, '月')
assert.ok(growthSchema.properties.status.enum.includes(growthSample.status))
assert.equal(growthSample.comparablePracticeCount, 4)
assert.equal(growthSample.requiredPracticeCount, 0)
assert.equal(growthSample.monitoring.status, 'monitoring')
assert.ok(growthSample.monitoring.reasonCodes.includes('LOW_RECENT_AVERAGE'))
assert.ok(growthSample.monitoring.reasonCodes.includes('LOW_STABILITY'))
assert.equal(growthSample.segments[0].points.length, 4)
assert.deepEqual(
  growthSample.segments[0].points.map((point) => point.totalScore),
  [72, 68, 64, 62]
)

const recentScores = growthSample.segments[0].points.slice(-3).map((point) => point.totalScore)
const recentAverage = recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length
const variance = recentScores.reduce(
  (sum, score) => sum + ((score - recentAverage) ** 2),
  0
) / (recentScores.length - 1)
const sampleStdDev = Math.sqrt(variance)
const decline = Math.max(0, recentScores[0] - recentScores.at(-1))
const stability = Math.round(Math.max(0, Math.min(100, 100 - (2 * sampleStdDev) - (6.5 * decline))))
assert.equal(Math.round(recentAverage), growthSample.recentAverage)
assert.equal(stability, growthSample.stabilityScore)

assert.equal(responsiveLayout.contractVersion, '2.0.0')
assert.deepEqual(
  responsiveLayout.breakpoints.map((breakpoint) => breakpoint.id),
  ['compact', 'medium', 'expanded']
)
assert.deepEqual(
  responsiveLayout.breakpoints.map((breakpoint) => [breakpoint.minWidth, breakpoint.maxWidth]),
  [[0, 599], [600, 839], [840, null]]
)
assert.deepEqual(responsiveLayout.expandedLayout.referenceViewport, {
  width: 1280,
  height: 800,
  orientation: 'landscape'
})
assert.deepEqual(
  responsiveLayout.expandedLayout.regions.map((region) => region.id),
  ['navigation-rail', 'character-master-list', 'comparison-workspace', 'insight-panel']
)
assert.deepEqual(
  responsiveLayout.expandedLayout.regions.map((region) => region.order),
  [1, 2, 3, 4]
)
assert.equal(responsiveLayout.expandedLayout.minimumTouchTarget, 44)

const [navigation, masterList, workspace, insight] = responsiveLayout.expandedLayout.regions
assert.equal(navigation.width.preferred, 78)
assert.equal(masterList.width.preferred, 222)
assert.equal(workspace.width.min, 470)
assert.ok(insight.width.min >= 310)
assert.ok(
  navigation.width.preferred + masterList.width.preferred + workspace.width.min + insight.width.min <=
    responsiveLayout.expandedLayout.referenceViewport.width,
  'expanded PAD regions do not fit the reference viewport'
)
assert.ok(responsiveLayout.collapseRules.some((rule) => rule.when === 'width < 840'))
assert.ok(responsiveLayout.invariants.includes('stability-is-null-before-three-comparable-practices'))
assert.ok(responsiveLayout.invariants.includes('teacher-review-and-periodic-reports-remain-absent'))
assert.equal(responsiveLayout.prototypeEvidence.productionCode, false)
assert.equal(
  responsiveLayout.prototypeEvidence.artifact,
  'prototype/mobile-v2/public/pad-preview.html'
)

console.log('harness contract drafts, V2 samples, and responsive layout are consistent')
