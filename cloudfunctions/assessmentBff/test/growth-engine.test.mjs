import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { buildCharacterGrowth, calculateStability } = require('../core/growth-engine')

const point = (practiceId, totalScore, assessedAt, overrides = {}) => ({
  practiceId,
  assessedAt,
  totalScore,
  taskStatus: 'completed',
  category: 'needs_correction',
  scoreVersion: 'score-v1',
  glyphVersion: 'glyph-v1',
  dimensions: {
    strokeStandard: totalScore,
    frameStructure: totalScore,
    glyphProportion: totalScore,
    positionLayout: totalScore
  },
  ...overrides
})

test('fewer than three comparable practices never fabricate stability or monitoring', () => {
  const growth = buildCharacterGrowth({
    studentCharacterId: 'subject:月', character: '月', now: '2026-08-11T10:00:00.000Z',
    points: [point('p1', 55, '2026-08-09T10:00:00.000Z'), point('p2', 50, '2026-08-10T10:00:00.000Z')]
  })
  assert.equal(growth.status, 'collecting')
  assert.equal(growth.requiredPracticeCount, 1)
  assert.equal(growth.recentAverage, null)
  assert.equal(growth.stabilityScore, null)
  assert.equal(growth.monitoring.status, 'not_eligible')
})

test('three declining low scores enter monitoring for both approved POC reasons', () => {
  const points = [
    point('p1', 72, '2026-08-08T10:00:00.000Z'),
    point('p2', 68, '2026-08-09T10:00:00.000Z'),
    point('p3', 62, '2026-08-10T10:00:00.000Z')
  ]
  const growth = buildCharacterGrowth({
    studentCharacterId: 'subject:月', character: '月', points, now: '2026-08-11T10:00:00.000Z'
  })
  assert.equal(growth.status, 'available')
  assert.equal(growth.recentAverage, 67)
  assert.equal(growth.stabilityScore, calculateStability([72, 68, 62]))
  assert.deepEqual(growth.monitoring.reasonCodes, ['LOW_RECENT_AVERAGE', 'LOW_STABILITY'])
  assert.equal(growth.monitoring.status, 'monitoring')
})

test('three stable high scores recover a monitored character', () => {
  const growth = buildCharacterGrowth({
    studentCharacterId: 'subject:月', character: '月', now: '2026-08-11T10:00:00.000Z',
    previousMonitoring: {
      status: 'monitoring', reasonCodes: ['LOW_STABILITY'], enteredAt: '2026-08-01T10:00:00.000Z'
    },
    points: [
      point('p1', 84, '2026-08-08T10:00:00.000Z'),
      point('p2', 85, '2026-08-09T10:00:00.000Z'),
      point('p3', 86, '2026-08-10T10:00:00.000Z')
    ]
  })
  assert.equal(growth.monitoring.status, 'recovered')
  assert.equal(growth.monitoring.exitedAt, '2026-08-11T10:00:00.000Z')
})

test('score or glyph version changes create a visible version break', () => {
  const growth = buildCharacterGrowth({
    studentCharacterId: 'subject:月', character: '月', now: '2026-08-11T10:00:00.000Z',
    points: [
      point('p1', 60, '2026-08-08T10:00:00.000Z'),
      point('p2', 62, '2026-08-09T10:00:00.000Z'),
      point('p3', 64, '2026-08-10T10:00:00.000Z'),
      point('p4', 82, '2026-08-11T10:00:00.000Z', { scoreVersion: 'score-v2' })
    ]
  })
  assert.equal(growth.status, 'version_break')
  assert.equal(growth.segments.length, 2)
  assert.equal(growth.comparablePracticeCount, 1)
  assert.equal(growth.stabilityScore, null)
})

test('uncertain and failed results are excluded from growth', () => {
  const growth = buildCharacterGrowth({
    studentCharacterId: 'subject:月', character: '月', now: '2026-08-11T10:00:00.000Z',
    points: [
      point('p1', 60, '2026-08-08T10:00:00.000Z'),
      point('p2', 20, '2026-08-09T10:00:00.000Z', { category: 'uncertain' }),
      point('p3', 10, '2026-08-10T10:00:00.000Z', { taskStatus: 'failed' })
    ]
  })
  assert.equal(growth.comparablePracticeCount, 1)
})
