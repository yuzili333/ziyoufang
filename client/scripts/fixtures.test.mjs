import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const fixtureRoot = new URL('../../harness/fixtures/', import.meta.url)
const metadata = JSON.parse(await readFile(new URL('metadata/multi-grid-v1.json', fixtureRoot), 'utf8'))
const assessment = JSON.parse(await readFile(
  new URL('expected/multi-grid-clear-v1.assessment.json', fixtureRoot), 'utf8'))
const quality = JSON.parse(await readFile(new URL('expected/image-quality-v1.json', fixtureRoot), 'utf8'))
const resultSchema = JSON.parse(await readFile(
  new URL('../contracts/assessment-result.schema.json', import.meta.url), 'utf8'))

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

test('synthetic grid fixture is traceable and contains no student data', async () => {
  assert.equal(metadata.synthetic, true)
  assert.equal(metadata.containsPersonalData, false)
  assert.equal(metadata.grid.rows, 4)
  assert.equal(metadata.grid.columns, 4)
  assert.notEqual(metadata.targetText, metadata.renderedText)

  for (const file of metadata.files) {
    const data = await readFile(new URL(`inputs/${file.name}`, fixtureRoot))
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256)
  }
})

test('fixture assessment covers sixteen characters and every MVP result category', () => {
  for (const field of resultSchema.required) {
    assert.ok(Object.hasOwn(assessment, field), `missing assessment field: ${field}`)
  }
  assert.equal(assessment.characters.length, 16)
  assert.deepEqual(new Set(assessment.characters.map((character) => character.category)),
    new Set(['normal', 'wrong', 'unattractive', 'uncertain']))

  const required = resultSchema.properties.characters.items.required
  for (const [index, character] of assessment.characters.entries()) {
    for (const field of required) {
      assert.ok(Object.hasOwn(character, field), `character ${index} missing field: ${field}`)
    }
    assert.equal(character.index, index)
    assert.ok(character.boundingBox.x >= 0 && character.boundingBox.y >= 0)
    assert.ok(character.boundingBox.x + character.boundingBox.width <= 1)
    assert.ok(character.boundingBox.y + character.boundingBox.height <= 1)
    if (character.category !== 'normal') {
      assert.ok(character.issues.length > 0)
    }
  }
  assert.equal(assessment.characters[3].expectedCharacter, '山')
  assert.equal(assessment.characters[3].recognizedCharacter, '出')
  const uncertain = assessment.characters.find((character) => character.category === 'uncertain')
  assert.equal(uncertain.score, null)
})

test('quality fixtures distinguish clear, blurred and incomplete grid inputs', async () => {
  assert.deepEqual(quality.cases.map((fixture) => fixture.reason),
    [null, 'IMAGE_BLUR', 'GRID_INCOMPLETE'])
  const clear = pngDimensions(await readFile(new URL('inputs/multi-grid-clear-v1.png', fixtureRoot)))
  const blurred = pngDimensions(await readFile(new URL('inputs/multi-grid-blurred-v1.png', fixtureRoot)))
  const cropped = pngDimensions(await readFile(new URL('inputs/multi-grid-cropped-v1.png', fixtureRoot)))
  assert.deepEqual(clear, { width: 1600, height: 1600 })
  assert.deepEqual(blurred, clear)
  assert.equal(cropped.height, clear.height)
  assert.ok(cropped.width < clear.width)
})
