const DEFAULT_POLICY = Object.freeze({
  minimumPractices: 3,
  monitorEnterThreshold: 70,
  monitorExitThreshold: 80,
  ruleVersion: 'poc-growth-v1'
})

const round = (value) => Math.round(value)
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function calculateStability(scores) {
  if (scores.length < 3) return null
  const recent = scores.slice(-3)
  const decline = Math.max(0, recent[0] - recent[2])
  return round(clamp(100 - (2 * sampleStandardDeviation(recent)) - (6.5 * decline), 0, 100))
}

function isComparablePoint(point) {
  return ['completed', 'partially_completed'].includes(point.taskStatus)
    && ['normal', 'wrong', 'needs_correction'].includes(point.category)
    && Number.isFinite(point.totalScore)
    && point.scoreVersion
    && point.glyphVersion
}

function normalizePoint(point, sequence, stability) {
  return {
    practiceId: point.practiceId,
    sequence,
    assessedAt: point.assessedAt,
    totalScore: point.totalScore,
    dimensions: {
      strokeStandard: point.dimensions.strokeStandard,
      frameStructure: point.dimensions.frameStructure,
      glyphProportion: point.dimensions.glyphProportion,
      positionLayout: point.dimensions.positionLayout,
      stability
    }
  }
}

function buildCharacterGrowth({
  studentCharacterId,
  character,
  points,
  previousMonitoring = null,
  now,
  policy = DEFAULT_POLICY
}) {
  const accepted = points.filter(isComparablePoint).sort((left, right) => {
    const time = left.assessedAt.localeCompare(right.assessedAt)
    return time || left.practiceId.localeCompare(right.practiceId)
  })
  const segmentsByVersion = new Map()
  for (const point of accepted) {
    const key = `${point.scoreVersion}\u0000${point.glyphVersion}`
    if (!segmentsByVersion.has(key)) segmentsByVersion.set(key, [])
    segmentsByVersion.get(key).push(point)
  }
  const segments = [...segmentsByVersion.entries()].map(([key, segmentPoints]) => {
    const [scoreVersion, glyphVersion] = key.split('\u0000')
    const scores = []
    return {
      scoreVersion,
      glyphVersion,
      points: segmentPoints.map((point, index) => {
        scores.push(point.totalScore)
        return normalizePoint(point, index + 1, calculateStability(scores))
      })
    }
  })

  const latestPoint = accepted.at(-1)
  if (latestPoint) {
    const latestSegmentIndex = segments.findIndex((segment) => (
      segment.scoreVersion === latestPoint.scoreVersion && segment.glyphVersion === latestPoint.glyphVersion
    ))
    if (latestSegmentIndex >= 0 && latestSegmentIndex !== segments.length - 1) {
      segments.push(...segments.splice(latestSegmentIndex, 1))
    }
  }
  const currentSegment = latestPoint
    ? segments.find((segment) => segment.scoreVersion === latestPoint.scoreVersion && segment.glyphVersion === latestPoint.glyphVersion)
    : null
  const currentPoints = currentSegment?.points ?? []
  const recentScores = currentPoints.slice(-3).map((point) => point.totalScore)
  const eligible = currentPoints.length >= policy.minimumPractices
  const recentAverage = eligible ? round(recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length) : null
  const stabilityScore = eligible ? calculateStability(recentScores) : null
  const reasonCodes = []
  if (eligible && recentAverage < policy.monitorEnterThreshold) reasonCodes.push('LOW_RECENT_AVERAGE')
  if (eligible && stabilityScore < policy.monitorEnterThreshold) reasonCodes.push('LOW_STABILITY')

  const wasMonitoring = previousMonitoring?.status === 'monitoring'
  const recovered = wasMonitoring
    && recentScores.every((score) => score >= policy.monitorExitThreshold)
    && recentAverage >= policy.monitorExitThreshold
    && stabilityScore >= policy.monitorExitThreshold
  const shouldMonitor = eligible && (wasMonitoring ? !recovered : reasonCodes.length > 0)
  const effectiveReasons = shouldMonitor && reasonCodes.length === 0
    ? (previousMonitoring?.reasonCodes ?? [])
    : reasonCodes

  return {
    studentCharacterId,
    character,
    status: !latestPoint
      ? 'collecting'
      : currentPoints.length < policy.minimumPractices && segments.length > 1
        ? 'version_break'
        : eligible ? 'available' : 'collecting',
    comparablePracticeCount: currentPoints.length,
    requiredPracticeCount: Math.max(0, policy.minimumPractices - currentPoints.length),
    recentAverage,
    stabilityScore,
    monitoring: {
      status: shouldMonitor ? 'monitoring' : recovered ? 'recovered' : 'not_eligible',
      reasonCodes: effectiveReasons,
      enterThreshold: policy.monitorEnterThreshold,
      exitThreshold: policy.monitorExitThreshold,
      ruleVersion: policy.ruleVersion,
      enteredAt: shouldMonitor ? (previousMonitoring?.enteredAt ?? now) : null,
      exitedAt: recovered ? now : null
    },
    segments
  }
}

module.exports = {
  DEFAULT_POLICY,
  buildCharacterGrowth,
  calculateStability,
  sampleStandardDeviation
}
