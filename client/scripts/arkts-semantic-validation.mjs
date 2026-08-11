import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const clientRoot = dirname(dirname(scriptPath))
const workspaceRoot = dirname(clientRoot)
const evidenceRoot = join(workspaceRoot, 'harness/results')
const sourceRoot = join(clientRoot, 'entry/src/main/ets')
const openHarmonyRoot = process.env.OPENHARMONY_HOME || process.env.OpenHarmony_HOME ||
  join(homedir(), 'Library/OpenHarmony/Sdk')
const arkuiXSdkRoot = process.env.ARKUIX_SDK_HOME ||
  join(homedir(), 'Library/ArkUI-X/Sdk')
const loaderRoot = join(openHarmonyRoot, '20/ets/build-tools/ets-loader')
const checkerPath = join(loaderRoot, 'lib/ets_checker.js')
const bridgeDeclarations = join(arkuiXSdkRoot, '20/arkui-x/engine/ets')

function sourceFilesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFilesUnder(path) : (entry.name.endsWith('.ets') ? [path] : [])
  })
}

if (process.argv.includes('--child')) {
  const require = createRequire(import.meta.url)
  const childIndex = process.argv.indexOf('--child')
  const cachePath = process.argv[childIndex + 1]
  const validationMode = process.argv[childIndex + 2]
  process.env.compileTool = 'rollup'
  process.env.compileMode = 'moduleJson'
  const main = require(join(loaderRoot, 'main.js'))
  const checker = require(checkerPath)
  main.partialUpdateConfig.executeArkTSLinter = validationMode === 'linter'
  main.partialUpdateConfig.skipTscOhModuleCheck = true

  const sourceFiles = sourceFilesUnder(sourceRoot).sort()
  const entries = Object.fromEntries(sourceFiles.map((path, index) => [String(index), path]))
  const checkerConfig = {
    aceModuleJsonPath: join(clientRoot, 'entry/src/main/module.json5'),
    buildPath: cachePath,
    bundleName: 'com.ziyoufang.client',
    cachePath,
    compileHar: false,
    compileMode: 'moduleJson',
    compileSdkVersion: 20,
    compatibleSdkVersion: 20,
    ignoreWarning: false,
    minAPIVersion: 20,
    moduleName: 'entry',
    modulePath: join(clientRoot, 'entry'),
    packageManagerType: 'ohpm',
    processTs: false,
    projectPath: sourceRoot,
    projectRootPath: clientRoot,
    permission: {
      requestPermissions: [
        { name: 'ohos.permission.CAMERA' },
        { name: 'ohos.permission.READ_IMAGEVIDEO' },
        { name: 'ohos.permission.INTERNET' }
      ],
      definePermissions: []
    },
    resolveModulePaths: [bridgeDeclarations]
  }
  require(join(loaderRoot, 'lib/fast_build/system_api/api_check_utils.js'))
    .configurePermission(checkerConfig)
  checker.etsStandaloneChecker(entries, undefined, checkerConfig)
  console.log(`ZIYOUFANG_CHECKER_COMPLETED:${validationMode}:${sourceFiles.length}`)
  process.exit(0)
}

for (const path of [checkerPath, bridgeDeclarations]) {
  if (!existsSync(path)) {
    throw new Error(`ArkTS semantic checker prerequisite is missing: ${path}`)
  }
}

const temporaryRoots = [
  mkdtempSync(join(tmpdir(), 'ziyoufang-arkts-semantic-')),
  mkdtempSync(join(tmpdir(), 'ziyoufang-arkts-linter-'))
]
const startedAt = new Date()
let semanticChild
let linterChild
try {
  semanticChild = spawnSync(process.execPath, [scriptPath, '--child', temporaryRoots[0], 'semantic'], {
    cwd: clientRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  })
  linterChild = spawnSync(process.execPath, [scriptPath, '--child', temporaryRoots[1], 'linter'], {
    cwd: clientRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  })
} finally {
  temporaryRoots.forEach((path) => rmSync(path, { recursive: true, force: true }))
}

const diagnosticPattern = /ArkTS:(ERROR|WARN) File: (.+?):(\d+):(\d+)\n ([^\n]+)/g
function parseChild(child, mode) {
  const rawOutput = `${child.stdout || ''}${child.stderr || ''}${child.error ? `${child.error.message}\n` : ''}`
  const plainOutput = rawOutput.replace(/\u001b\[[0-9;]*m/g, '')
  const diagnostics = []
  for (const match of plainOutput.matchAll(diagnosticPattern)) {
    diagnostics.push({
      level: match[1].toLowerCase(),
      file: match[2].replaceAll(clientRoot, '$CLIENT_ROOT').replaceAll(homedir(), '$HOME'),
      line: Number(match[3]),
      column: Number(match[4]),
      message: match[5]
    })
  }
  const sourceCountMatch = plainOutput.match(new RegExp(`ZIYOUFANG_CHECKER_COMPLETED:${mode}:(\\d+)`))
  return {
    rawExitCode: child.status ?? 1,
    sourceCount: sourceCountMatch ? Number(sourceCountMatch[1]) : 0,
    outputSha256: createHash('sha256').update(rawOutput).digest('hex'),
    diagnostics
  }
}

const semantic = parseChild(semanticChild, 'semantic')
const linter = parseChild(linterChild, 'linter')
const semanticErrors = semantic.diagnostics.filter((diagnostic) => diagnostic.level === 'error')
const semanticWarnings = semantic.diagnostics.filter((diagnostic) => diagnostic.level === 'warn')
const projectLinterErrors = linter.diagnostics.filter((diagnostic) =>
  diagnostic.level === 'error' && diagnostic.file.startsWith('$CLIENT_ROOT/'))
const projectLinterWarnings = linter.diagnostics.filter((diagnostic) =>
  diagnostic.level === 'warn' && diagnostic.file.startsWith('$CLIENT_ROOT/'))
const externalLinterErrors = linter.diagnostics.filter((diagnostic) =>
  diagnostic.level === 'error' && !diagnostic.file.startsWith('$CLIENT_ROOT/'))
const externalLinterWarnings = linter.diagnostics.filter((diagnostic) =>
  diagnostic.level === 'warn' && !diagnostic.file.startsWith('$CLIENT_ROOT/'))
const finishedAt = new Date()
const report = {
  schemaVersion: 1,
  scope: 'official-openharmony-ets-project-source-syntactic-semantic-and-linter-checker',
  excludes: [
    'external SDK declaration restricted-syntax diagnostics (reported separately)',
    'ArkUI transformed code generation',
    'hvigor project model',
    'complete ArkUI-X application packaging',
    'device runtime'
  ],
  apiVersion: 20,
  checker: '$OPENHARMONY_HOME/20/ets/build-tools/ets-loader/lib/ets_checker.js',
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  passed: semantic.rawExitCode === 0 && linter.rawExitCode === 0 &&
    semantic.sourceCount > 0 && semantic.sourceCount === linter.sourceCount &&
    semanticErrors.length === 0 && projectLinterErrors.length === 0,
  semantic: {
    ...semantic,
    errorCount: semanticErrors.length,
    warningCount: semanticWarnings.length
  },
  projectLinterErrorCount: projectLinterErrors.length,
  projectLinterWarningCount: projectLinterWarnings.length,
  externalLinterErrorCount: externalLinterErrors.length,
  externalLinterWarningCount: externalLinterWarnings.length,
  linter
}

mkdirSync(evidenceRoot, { recursive: true })
const reportPath = join(evidenceRoot,
  `arkts-semantic-validation-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`ArkTS checker covered ${semantic.sourceCount} files: ` +
  `${semanticErrors.length} semantic errors, ${semanticWarnings.length} semantic warnings, ` +
  `${projectLinterErrors.length} project linter errors, ${projectLinterWarnings.length} project linter warnings, ` +
  `${externalLinterErrors.length} external SDK linter errors, ` +
  `${externalLinterWarnings.length} external SDK linter warnings`)
console.log(`Validation evidence: ${reportPath}`)
if (!report.passed) {
  semanticErrors.concat(projectLinterErrors).forEach((diagnostic) => console.error(
    `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`))
  process.exit(1)
}
