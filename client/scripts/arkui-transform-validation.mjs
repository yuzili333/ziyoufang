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
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const clientRoot = dirname(dirname(scriptPath))
const workspaceRoot = dirname(clientRoot)
const evidenceRoot = join(workspaceRoot, 'harness/results')
const sourceRoot = join(clientRoot, 'entry/src/main/ets')
const openHarmonyRoot = process.env.OPENHARMONY_HOME || process.env.OpenHarmony_HOME ||
  join(homedir(), 'Library/OpenHarmony/Sdk')
const loaderRoot = join(openHarmonyRoot, '20/ets/build-tools/ets-loader')
const compiler = join(loaderRoot, 'bin/ark/build-mac/bin/es2abc')
const sdkManifestPath = join(openHarmonyRoot, '20/ets/oh-uni-package.json')
const compilerConfigPath = join(loaderRoot, 'tsconfig.json')

function sourceFilesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFilesUnder(path) : (entry.name.endsWith('.ets') ? [path] : [])
  })
}

const allSourceFiles = sourceFilesUnder(sourceRoot).sort()
const declarativeFiles = allSourceFiles.filter((path) => {
  const source = readFileSync(path, 'utf8')
  return /@(Entry|Component)\b/.test(source)
})

if (process.argv.includes('--transform-child')) {
  const require = createRequire(import.meta.url)
  const childIndex = process.argv.indexOf('--transform-child')
  const sourceFile = resolve(process.argv[childIndex + 1])
  const outputFile = resolve(process.argv[childIndex + 2])
  const metadataFile = resolve(process.argv[childIndex + 3])
  process.env.compiler = 'on'
  process.env.compileMode = 'moduleJson'
  process.env.compileTool = 'rollup'

  const ts = require(join(loaderRoot, 'node_modules/typescript'))
  const main = require(join(loaderRoot, 'main.js'))
  const ui = require(join(loaderRoot, 'lib/process_ui_syntax.js'))
  const utils = require(join(loaderRoot, 'lib/utils.js'))
  const metadata = {
    passed: false,
    parseDiagnostics: [],
    emitDiagnostics: [],
    transformDiagnostics: [],
    syntaxUiCallbacks: [],
    thrown: ''
  }

  try {
    if (!declarativeFiles.includes(sourceFile)) {
      throw new Error(`Source is outside the declarative validation set: ${sourceFile}`)
    }
    Object.assign(main.projectConfig, {
      aceModuleJsonPath: join(clientRoot, 'entry/src/main/module.json5'),
      bundleName: 'com.ziyoufang.client',
      compileHar: false,
      compileMode: 'esmodule',
      integratedHsp: false,
      minAPIVersion: 20,
      moduleName: 'entry',
      moduleRootPath: join(clientRoot, 'entry'),
      processTs: false,
      projectPath: sourceRoot,
      projectRootPath: clientRoot
    })
    main.partialUpdateConfig.partialUpdateMode = true
    main.partialUpdateConfig.executeArkTSLinter = false
    main.resources.app.media = { icon: 0x01000000 }

    // The full ArkUI compiler configuration declares which function parameters
    // are UI callbacks (notably ForEach/LazyForEach). tsconfig.esm.json omits
    // syntaxComponents and cannot parse nested declarative UI in those callbacks.
    const configRead = ts.readConfigFile(compilerConfigPath, ts.sys.readFile)
    if (configRead.error !== undefined) {
      throw new Error(ts.flattenDiagnosticMessageText(configRead.error.messageText, '\n'))
    }
    const rawConfig = configRead.config
    const compilerOptions = ts.parseJsonConfigFileContent(rawConfig, ts.sys, loaderRoot).options
    Object.assign(compilerOptions, {
      module: ts.ModuleKind.ES2020,
      noEmit: false,
      noEmitOnError: false,
      skipLibCheck: true,
      sourceMap: false,
      target: ts.ScriptTarget.ES2021
    })
    metadata.syntaxUiCallbacks = compilerOptions.ets?.syntaxComponents?.paramsUICallback || []
    if (!metadata.syntaxUiCallbacks.includes('ForEach')) {
      throw new Error('Official ArkUI compiler configuration does not declare ForEach as a UI callback')
    }

    const program = ts.createProgram(allSourceFiles, compilerOptions)
    const source = program.getSourceFile(sourceFile)
    if (source === undefined) {
      throw new Error(`ETS program did not load source: ${sourceFile}`)
    }
    metadata.parseDiagnostics = source.parseDiagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))

    main.globalProgram.program = program
    main.globalProgram.checker = program.getTypeChecker()
    utils.storedFileInfo.addFileCacheInfo(sourceFile)
    utils.storedFileInfo.setCurrentArkTsFile()
    utils.CurrentProcessFile.setIsProcessingFileETS(sourceFile)
    ui.resetProcessUiSyntax()
    ui.resetLog()

    let transformed = ''
    const emit = program.emit(source, (name, content) => {
      if (name.endsWith('.js')) {
        transformed = content
      }
    }, undefined, false, {
      before: [ui.processUISyntax(null, false, null, sourceFile, null, {})]
    })
    metadata.emitDiagnostics = emit.diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    metadata.transformDiagnostics = ui.transformLog.errors.map((diagnostic) => ({
      level: `${diagnostic.type}`.toLowerCase(),
      code: `${diagnostic.code || ''}`,
      message: diagnostic.message
    }))
    metadata.passed = !emit.emitSkipped && metadata.parseDiagnostics.length === 0 &&
      metadata.emitDiagnostics.length === 0 && metadata.transformDiagnostics.length === 0 &&
      transformed.length > 0 && /extends ViewPU/.test(transformed) &&
      /observeComponentCreation2/.test(transformed)
    if (transformed.length > 0) {
      writeFileSync(outputFile, transformed, 'utf8')
    }
  } catch (error) {
    metadata.thrown = error instanceof Error ? error.stack || error.message : String(error)
  }
  writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  process.exit(metadata.passed ? 0 : 1)
}

for (const path of [join(loaderRoot, 'lib/process_ui_syntax.js'), compiler, sdkManifestPath]) {
  if (!existsSync(path)) {
    throw new Error(`ArkUI transform validation prerequisite is missing: ${path}`)
  }
}
if (declarativeFiles.length === 0) {
  throw new Error('ArkUI transform validation found no declarative files')
}

const sdkManifest = JSON.parse(readFileSync(sdkManifestPath, 'utf8'))
const temporaryRoot = mkdtempSync(join(tmpdir(), 'ziyoufang-arkui-transform-'))
const startedAt = new Date()
const results = []

function scrub(value) {
  return value
    .replaceAll(clientRoot, '$CLIENT_ROOT')
    .replaceAll(workspaceRoot, '$WORKSPACE_ROOT')
    .replaceAll(homedir(), '$HOME')
    .replaceAll(temporaryRoot, '$TEMP')
}

try {
  for (const sourceFile of declarativeFiles) {
    const stem = basename(sourceFile, '.ets')
    const transformedFile = join(temporaryRoot, `${stem}.js`)
    const metadataFile = join(temporaryRoot, `${stem}.transform.json`)
    const abcFile = join(temporaryRoot, `${stem}.abc`)
    const transform = spawnSync(process.execPath, [
      scriptPath, '--transform-child', sourceFile, transformedFile, metadataFile
    ], {
      cwd: clientRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    })
    const transformOutput = `${transform.stdout || ''}${transform.stderr || ''}` +
      `${transform.error ? `${transform.error.message}\n` : ''}`
    const metadata = existsSync(metadataFile)
      ? JSON.parse(readFileSync(metadataFile, 'utf8'))
      : { passed: false, thrown: 'transform metadata was not generated' }
    const transformed = transform.status === 0 && metadata.passed && existsSync(transformedFile) &&
      statSync(transformedFile).size > 0

    let compile
    if (transformed) {
      compile = spawnSync(compiler, [
        '--extension', 'js',
        '--module',
        '--target-api-version', '20',
        '--output', abcFile,
        transformedFile
      ], {
        cwd: clientRoot,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024
      })
    }
    const compileOutput = compile === undefined ? '' :
      `${compile.stdout || ''}${compile.stderr || ''}${compile.error ? `${compile.error.message}\n` : ''}`
    const generated = compile?.status === 0 && existsSync(abcFile) && statSync(abcFile).size > 0
    results.push({
      source: `$CLIENT_ROOT/${relative(clientRoot, sourceFile)}`,
      transformed,
      transformExitCode: transform.status ?? 1,
      transformedBytes: transformed ? statSync(transformedFile).size : 0,
      transformedSha256: transformed
        ? createHash('sha256').update(readFileSync(transformedFile)).digest('hex')
        : undefined,
      transformMetadata: JSON.parse(scrub(JSON.stringify(metadata))),
      transformOutputSha256: createHash('sha256').update(scrub(transformOutput)).digest('hex'),
      generated,
      compilerExitCode: compile?.status ?? 1,
      abcBytes: generated ? statSync(abcFile).size : 0,
      abcSha256: generated
        ? createHash('sha256').update(readFileSync(abcFile)).digest('hex')
        : undefined,
      compilerOutput: scrub(compileOutput)
    })
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}

const finishedAt = new Date()
const report = {
  schemaVersion: 1,
  scope: 'official-openharmony-ets-loader-ui-transformation-and-ark-bytecode-compilation',
  excludes: [
    'hvigor project model and integrated module resolution',
    'platform resource compilation and production resource ID assignment',
    'complete ArkUI-X application linking and packaging',
    'installation and device runtime'
  ],
  sdkVersion: sdkManifest.version,
  apiVersion: Number(sdkManifest.apiVersion),
  transformer: '$OPENHARMONY_HOME/20/ets/build-tools/ets-loader/lib/process_ui_syntax.js',
  compilerConfiguration: '$OPENHARMONY_HOME/20/ets/build-tools/ets-loader/tsconfig.json',
  compiler: '$OPENHARMONY_HOME/20/ets/build-tools/ets-loader/bin/ark/build-mac/bin/es2abc',
  resourceFixture: { 'app.media.icon': '0x01000000' },
  sourceCount: declarativeFiles.length,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  passed: results.length > 0 && results.every((result) => result.transformed && result.generated),
  results
}

mkdirSync(evidenceRoot, { recursive: true })
const reportPath = join(evidenceRoot,
  `arkui-transform-validation-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`ArkUI transformed and compiled ${results.filter((result) =>
  result.transformed && result.generated).length}/${results.length} declarative files`)
console.log(`Validation evidence: ${reportPath}`)
if (!report.passed) {
  results.filter((result) => !result.transformed || !result.generated).forEach((result) => {
    console.error(`${result.source}: ${JSON.stringify(result.transformMetadata)} ${result.compilerOutput}`)
  })
  process.exit(1)
}
