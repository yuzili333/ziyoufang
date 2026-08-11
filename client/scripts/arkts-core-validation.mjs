import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = dirname(clientRoot)
const evidenceRoot = join(workspaceRoot, 'harness/results')
const openHarmonyRoot = process.env.OPENHARMONY_HOME || process.env.OpenHarmony_HOME ||
  join(homedir(), 'Library/OpenHarmony/Sdk')
const compiler = join(openHarmonyRoot,
  '20/ets/build-tools/ets-loader/bin/ark/build-mac/bin/es2abc')
const sourceRoot = join(clientRoot, 'entry/src/main/ets')
const includedDirectories = ['adapters', 'domain', 'services', 'entryability']
const includedFiles = ['components/Theme.ets']

if (!existsSync(compiler)) {
  throw new Error(`OpenHarmony Ark compiler is missing: ${compiler}`)
}

const sourceFiles = includedDirectories.flatMap((directory) =>
  readdirSync(join(sourceRoot, directory))
    .filter((name) => name.endsWith('.ets'))
    .map((name) => join(sourceRoot, directory, name)))
  .concat(includedFiles.map((file) => join(sourceRoot, file)))
  .sort()

const temporaryRoot = mkdtempSync(join(tmpdir(), 'ziyoufang-arkts-core-'))
const startedAt = new Date()
const results = []

try {
  for (const sourceFile of sourceFiles) {
    const relativeSource = relative(clientRoot, sourceFile)
    const outputFile = join(temporaryRoot, `${basename(sourceFile, '.ets')}.abc`)
    const result = spawnSync(compiler, [
      '--extension', 'ts',
      '--module',
      '--target-api-version', '20',
      '--output', outputFile,
      sourceFile
    ], {
      cwd: clientRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    })
    const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? `${result.error.message}\n` : ''}`
      .replaceAll(clientRoot, '$CLIENT_ROOT')
      .replaceAll(homedir(), '$HOME')
      .replaceAll(temporaryRoot, '$TEMP')
    const generated = result.status === 0 && existsSync(outputFile) && statSync(outputFile).size > 0
    results.push({
      source: `$CLIENT_ROOT/${relativeSource}`,
      exitCode: result.status ?? 1,
      generated,
      abcBytes: generated ? statSync(outputFile).size : 0,
      abcSha256: generated ? createHash('sha256').update(readFileSync(outputFile)).digest('hex') : undefined,
      output
    })
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}

const finishedAt = new Date()
const report = {
  schemaVersion: 1,
  scope: 'official-openharmony-ark-compiler-for-non-ui-arkts-core',
  excludes: [
    'ArkUI declarative page and component transformation',
    'hvigor project model and type checking',
    'complete ArkUI-X application packaging',
    'device runtime'
  ],
  compiler: '$OPENHARMONY_HOME/20/ets/build-tools/ets-loader/bin/ark/build-mac/bin/es2abc',
  targetApi: 20,
  sourceCount: sourceFiles.length,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  passed: results.length > 0 && results.every((result) => result.exitCode === 0 && result.generated),
  results
}

mkdirSync(evidenceRoot, { recursive: true })
const reportPath = join(evidenceRoot,
  `arkts-core-validation-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`Ark compiler generated ${results.filter((result) => result.generated).length}/${results.length} ABC files`)
console.log(`Validation evidence: ${reportPath}`)
if (!report.passed) {
  results.filter((result) => !result.generated || result.exitCode !== 0)
    .forEach((result) => console.error(`${result.source}: ${result.output}`))
  process.exit(1)
}
