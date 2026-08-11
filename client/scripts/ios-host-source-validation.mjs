import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = dirname(clientRoot)
const iosRoot = join(clientRoot, '.arkui-x/ios')
const iosAppRoot = join(iosRoot, 'app')
const evidenceRoot = join(workspaceRoot, 'harness/results')
const commandLineToolsSdkRoot = '/Library/Developer/CommandLineTools/SDKs'
const arkuiXSdkRoot = process.env.ARKUIX_SDK_HOME || join(homedir(), 'Library/ArkUI-X/Sdk')
const arkuiFrameworkRoot = join(arkuiXSdkRoot,
  '20/arkui-x/engine/framework/arkui/ios-arm64-simulator')
const arkuiFrameworkHeaders = join(arkuiFrameworkRoot, 'libarkui_ios.framework/Headers')

function newestMacOsSdk() {
  if (!existsSync(commandLineToolsSdkRoot)) {
    return ''
  }
  const currentSdk = join(commandLineToolsSdkRoot, 'MacOSX.sdk')
  if (existsSync(currentSdk)) {
    return currentSdk
  }
  const candidates = readdirSync(commandLineToolsSdkRoot)
    .filter((name) => /^MacOSX\d+(?:\.\d+)*\.sdk$/.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  return candidates.length > 0 ? join(commandLineToolsSdkRoot, candidates[candidates.length - 1]) : ''
}

const macOsSdk = newestMacOsSdk()
const compatibilityFrameworks = join(macOsSdk, 'System/iOSSupport/System/Library/Frameworks')
const objectiveCSources = readdirSync(iosAppRoot)
  .filter((name) => name.endsWith('.m'))
  .sort()
  .map((name) => join(iosAppRoot, name))
const plist = join(iosAppRoot, 'Info.plist')
const project = join(iosRoot, 'app.xcodeproj/project.pbxproj')
const prerequisites = [
  '/usr/bin/clang',
  '/usr/bin/plutil',
  macOsSdk,
  join(compatibilityFrameworks, 'UIKit.framework'),
  join(macOsSdk, 'System/Library/Frameworks/AVFoundation.framework'),
  arkuiFrameworkHeaders,
  plist,
  project,
  ...objectiveCSources
]
const missing = prerequisites.filter((path) => path.length === 0 || !existsSync(path))
if (objectiveCSources.length === 0 || missing.length > 0) {
  console.error('iOS host source validation prerequisites are incomplete:')
  missing.forEach((path) => console.error(`- ${path.length > 0 ? path : 'Command Line Tools macOS SDK'}`))
  process.exit(1)
}

function execute(command, args) {
  const result = spawnSync(command, args, {
    cwd: clientRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  })
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? `${result.error.message}\n` : ''}`
  process.stdout.write(output)
  return {
    command,
    args,
    exitCode: result.status ?? 1,
    output
  }
}

const startedAt = new Date()
const plistLint = execute('/usr/bin/plutil', ['-lint', plist, project])
const temporaryBuildRoot = mkdtempSync(join(tmpdir(), 'ziyoufang-ios-host-'))
const clangChecks = []
const objectArtifacts = []
try {
  for (const source of objectiveCSources) {
    const outputName = `${basename(source, '.m')}.o`
    const outputPath = join(temporaryBuildRoot, outputName)
    const check = execute('/usr/bin/clang', [
      '-c',
      '-fobjc-arc',
      '-Werror',
      '-Wno-nullability-completeness',
      '-Wno-unguarded-availability-new',
      '-target', 'arm64-apple-ios14.0-macabi',
      '-isysroot', macOsSdk,
      '-iframework', compatibilityFrameworks,
      '-F', arkuiFrameworkRoot,
      '-I', iosAppRoot,
      source,
      '-o', outputPath
    ])
    clangChecks.push(check)
    if (check.exitCode === 0 && existsSync(outputPath)) {
      const object = readFileSync(outputPath)
      objectArtifacts.push({
        source: source,
        outputName,
        bytes: object.byteLength,
        sha256: createHash('sha256').update(object).digest('hex')
      })
    }
  }
} finally {
  rmSync(temporaryBuildRoot, { recursive: true, force: true })
}
const finishedAt = new Date()

function scrub(value) {
  return value
    .replaceAll(clientRoot, '$CLIENT_ROOT')
    .replaceAll(workspaceRoot, '$WORKSPACE_ROOT')
    .replaceAll(homedir(), '$HOME')
    .replaceAll(temporaryBuildRoot, '$TEMP_BUILD')
}

function commandEvidence(result) {
  const sanitizedOutput = scrub(result.output)
  return {
    command: scrub(result.command),
    arguments: result.args.map((argument) => scrub(argument)),
    exitCode: result.exitCode,
    outputSha256: createHash('sha256').update(sanitizedOutput).digest('hex'),
    outputTail: sanitizedOutput.slice(-12000)
  }
}

const report = {
  schemaVersion: 1,
  scope: 'ios-objective-c-host-object-compilation-via-command-line-tools-maccatalyst-headers',
  excludes: [
    'iPhoneOS or iPhoneSimulator SDK compilation',
    'iOS 13 availability analysis',
    'native linking and application packaging',
    'public ArkTS compilation and complete ArkUI-X packaging',
    'installation, simulator runtime and physical device camera capture'
  ],
  compatibilityTarget: 'arm64-apple-ios14.0-macabi',
  sourceCount: objectiveCSources.length,
  sources: objectiveCSources.map((path) => scrub(path)),
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  passed: plistLint.exitCode === 0 && clangChecks.every((check) => check.exitCode === 0) &&
    objectArtifacts.length === objectiveCSources.length,
  checks: {
    plistAndProjectSyntax: commandEvidence(plistLint),
    objectiveCArcAndApiTypes: clangChecks.map(commandEvidence)
  },
  objectArtifacts: objectArtifacts.map((artifact) => ({
    ...artifact,
    source: scrub(artifact.source)
  }))
}

mkdirSync(evidenceRoot, { recursive: true })
const filename = `ios-host-source-validation-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`
const reportPath = join(evidenceRoot, filename)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`iOS host source validation compiled ${objectArtifacts.length}/${objectiveCSources.length} ` +
  'Objective-C files to arm64 Mach-O objects')
console.log(`Validation evidence: ${reportPath}`)

if (!report.passed) {
  process.exit(1)
}
