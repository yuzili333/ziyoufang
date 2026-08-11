import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const contract = JSON.parse(await readFile(new URL('../contracts/client-capabilities.json', import.meta.url), 'utf8'))
const resultSchema = JSON.parse(await readFile(new URL('../contracts/assessment-result.schema.json', import.meta.url), 'utf8'))

test('three release platforms and minimum versions are locked', () => {
  assert.deepEqual(Object.keys(contract.platforms), ['harmonyos', 'android', 'ios'])
  assert.equal(contract.platforms.harmonyos.api, 20)
  assert.equal(contract.platforms.android.api, 26)
  assert.equal(contract.platforms.android.capture, 'CameraX 1.2.3')
  assert.equal(contract.platforms.ios.minimum, '13.0')
})

test('three capture hosts remain behind the cross-platform service boundary', () => {
  assert.equal(contract.platforms.harmonyos.captureHost, 'cameraPicker system surface')
  assert.match(contract.platforms.android.captureHost, /ArkUI-X bridge/)
  assert.match(contract.platforms.ios.captureHost, /ArkUI-X bridge/)
})

test('responsive ranges are contiguous and PAD-ready', () => {
  const { compact, medium, expanded } = contract.responsive
  assert.equal(compact.minimumVp, 0)
  assert.equal(compact.maximumVp + 1, medium.minimumVp)
  assert.equal(medium.maximumVp + 1, expanded.minimumVp)
  assert.equal(expanded.maximumVp, null)
})

test('assessment state machine preserves retry and terminal semantics', () => {
  assert.deepEqual(Object.keys(contract.stateTransitions), contract.taskStates)
  assert.ok(contract.stateTransitions.local_pending.includes('uploading'))
  assert.ok(contract.stateTransitions.failed.includes('local_pending'))
  assert.deepEqual(contract.stateTransitions.completed, [])
  assert.deepEqual(contract.stateTransitions.cancelled, [])
  for (const targets of Object.values(contract.stateTransitions)) {
    for (const target of targets) {
      assert.ok(contract.taskStates.includes(target), `unknown transition target: ${target}`)
    }
  }
})

test('multi-character result contract contains evidence and correction fields', () => {
  const character = resultSchema.properties.characters.items
  for (const field of ['index', 'boundingBox', 'standardGlyphVersion', 'category', 'issues', 'suggestion']) {
    assert.ok(character.required.includes(field), `missing required character field: ${field}`)
  }
  assert.deepEqual(character.properties.category.enum, ['normal', 'wrong', 'unattractive', 'uncertain'])
  assert.deepEqual(character.properties.score.type, ['number', 'null'])
})

test('MVP exclusions prevent removed product areas from returning', () => {
  assert.ok(contract.excludedMvpFeatures.includes('teacher_review'))
  assert.ok(contract.excludedMvpFeatures.includes('periodic_reports'))
  assert.ok(contract.excludedMvpFeatures.includes('on_device_model'))
})

test('official ArkUI-X adapters cover shared persistence and transport capabilities', () => {
  assert.deepEqual(contract.crossPlatformAdapters, [
    'PhotoAccessHelper',
    'file.fs',
    'file.statvfs',
    'relationalStore',
    'preferences',
    'net.http'
  ])
})

test('network retry policy is bounded and idempotent', () => {
  assert.equal(contract.networkPolicy.idempotencyHeader, 'Idempotency-Key')
  assert.equal(contract.networkPolicy.maximumAttempts, 3)
  assert.deepEqual(contract.networkPolicy.retryableStatuses, [408, 429, '5xx'])
  assert.equal(contract.networkPolicy.uploadFormat, 'multipart/form-data')
})
