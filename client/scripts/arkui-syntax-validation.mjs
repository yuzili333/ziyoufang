import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = dirname(clientRoot)
const evidenceRoot = join(workspaceRoot, 'harness/results')
const openHarmonyRoot = process.env.OPENHARMONY_HOME || process.env.OpenHarmony_HOME ||
  join(homedir(), 'Library/OpenHarmony/Sdk')
const etsRoot = join(openHarmonyRoot, '20/ets')
const loaderRoot = join(etsRoot, 'build-tools/ets-loader')
const loaderEntry = join(loaderRoot, 'lib/pre_process.js')
const sdkManifestPath = join(etsRoot, 'oh-uni-package.json')
const sourceRoot = join(clientRoot, 'entry/src/main/ets')
const pagesProfilePath = join(clientRoot,
  'entry/src/main/resources/base/profile/main_pages.json')

for (const path of [loaderEntry, sdkManifestPath, pagesProfilePath]) {
  if (!existsSync(path)) {
    throw new Error(`OpenHarmony ArkUI syntax prerequisite is missing: ${path}`)
  }
}

const main = require(join(loaderRoot, 'main.js'))
const preProcess = require(loaderEntry)
const sdkManifest = JSON.parse(readFileSync(sdkManifestPath, 'utf8'))
const pageProfile = JSON.parse(readFileSync(pagesProfilePath, 'utf8'))
const entryPages = new Set(pageProfile.src || [])

Object.assign(main.projectConfig, {
  bundleName: 'com.ziyoufang.client',
  compileHar: false,
  compileMode: 'esmodule',
  minAPIVersion: 20,
  moduleName: 'entry',
  processTs: false,
  projectPath: sourceRoot,
  projectRootPath: clientRoot
})

const sourceFiles = ['pages', 'components']
  .flatMap((directory) => readdirSync(join(sourceRoot, directory))
    .filter((name) => name.endsWith('.ets'))
    .map((name) => join(sourceRoot, directory, name)))
  .filter((path) => /@(Entry|Component)\b/.test(readFileSync(path, 'utf8')))
  .sort()

const startedAt = new Date()
const results = []

for (const sourceFile of sourceFiles) {
  const relativeSource = relative(sourceRoot, sourceFile)
  const pageName = relativeSource.replace(/\.ets$/, '')
  const logs = []
  let processed = ''
  let thrown = ''
  const loaderContext = {
    resourcePath: sourceFile,
    resourceQuery: entryPages.has(pageName) ? '?entry' : '',
    cacheable() {},
    emitError(error) {
      logs.push({ level: 'error', message: String(error) })
    },
    emitWarning(warning) {
      logs.push({ level: 'warning', message: String(warning) })
    }
  }

  try {
    processed = preProcess.call(loaderContext, readFileSync(sourceFile, 'utf8'))
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error)
  }

  const redact = (value) => value
    .replaceAll(clientRoot, '$CLIENT_ROOT')
    .replaceAll(homedir(), '$HOME')
  results.push({
    source: `$CLIENT_ROOT/${relative(clientRoot, sourceFile)}`,
    entryPage: entryPages.has(pageName),
    processedBytes: Buffer.byteLength(processed),
    processedSha256: processed
      ? createHash('sha256').update(processed).digest('hex')
      : undefined,
    errors: logs.filter((log) => log.level === 'error')
      .map((log) => redact(log.message)),
    warnings: logs.filter((log) => log.level === 'warning')
      .map((log) => redact(log.message)),
    thrown: thrown ? redact(thrown) : undefined
  })
}

const finishedAt = new Date()
const report = {
  schemaVersion: 1,
  scope: 'official-openharmony-ets-loader-ui-syntax-validation',
  excludes: [
    'ArkUI transformed code generation',
    'ArkTS semantic type checking',
    'hvigor project model',
    'complete ArkUI-X application packaging',
    'device runtime'
  ],
  sdkVersion: sdkManifest.version,
  apiVersion: Number(sdkManifest.apiVersion),
  loader: '$OPENHARMONY_HOME/20/ets/build-tools/ets-loader/lib/pre_process.js',
  sourceCount: sourceFiles.length,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  passed: sourceFiles.length > 0 && results.every((result) =>
    !result.thrown && result.errors.length === 0 && result.processedBytes > 0),
  results
}

mkdirSync(evidenceRoot, { recursive: true })
const reportPath = join(evidenceRoot,
  `arkui-syntax-validation-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`ArkUI syntax validated ${results.filter((result) =>
  !result.thrown && result.errors.length === 0 && result.processedBytes > 0).length}/${results.length} declarative files`)
console.log(`Validation evidence: ${reportPath}`)
if (!report.passed) {
  results.filter((result) => result.thrown || result.errors.length > 0 || result.processedBytes === 0)
    .forEach((result) => console.error(`${result.source}: ${result.thrown || result.errors.join('\n') || 'no processed output'}`))
  process.exit(1)
}
