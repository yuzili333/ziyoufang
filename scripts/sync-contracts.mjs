import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'packages/contracts/generated')
await mkdir(resolve(output, 'fixtures'), { recursive: true })
await mkdir(resolve(root, 'cloudfunctions/assessmentBff/fixtures'), { recursive: true })

const files = [
  ['harness/contracts/assessment-result.schema.json', 'assessment-result.schema.json'],
  ['harness/contracts/character-growth.schema.json', 'character-growth.schema.json'],
  ['harness/contracts/model-advice.schema.json', 'model-advice.schema.json'],
  ['harness/contracts/assessment-task-state-machine.json', 'assessment-task-state-machine.json'],
  ['harness/contracts/cloud-data-model.json', 'cloud-data-model.json'],
  ['harness/fixtures/expected/assessment-result-v2.contract.json', 'fixtures/assessment-result-v2.contract.json'],
  ['harness/fixtures/expected/character-growth-v1.contract.json', 'fixtures/character-growth-v1.contract.json']
]

for (const [source, destination] of files) {
  await copyFile(resolve(root, source), resolve(output, destination))
}

await copyFile(
  resolve(root, 'harness/fixtures/expected/assessment-result-v2.contract.json'),
  resolve(root, 'cloudfunctions/assessmentBff/fixtures/assessment-result-v2.contract.json')
)

console.log(`synced ${files.length} approved contracts and fixtures plus the cloud-function fixture`)
