import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = dirname(clientRoot)
const evidenceRoot = join(workspaceRoot, 'harness/results')
const defaultAce = join(homedir(), '.npm-global/bin/ace')
const aceBin = process.env.ACE_BIN || (existsSync(defaultAce) ? defaultAce : 'ace')
const allowedPlatforms = ['harmonyos', 'android', 'ios']
const allowedPhases = ['check', 'build', 'run']

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function has(name) {
  return process.argv.includes(name)
}

const phase = option('--phase') || 'check'
const platform = option('--platform') || 'all'
const device = option('--device')
const simulator = has('--simulator')

if (!allowedPhases.includes(phase)) {
  throw new Error(`Unsupported phase: ${phase}`)
}
if (platform !== 'all' && !allowedPlatforms.includes(platform)) {
  throw new Error(`Unsupported platform: ${platform}`)
}
if (phase === 'run' && (platform === 'all' || device === undefined)) {
  throw new Error('Run phase requires one --platform and an explicit --device identifier')
}
if (simulator && platform !== 'ios') {
  throw new Error('--simulator is only valid with --platform ios')
}

function scrub(output) {
  let sanitized = output
    .replaceAll(clientRoot, '$CLIENT_ROOT')
    .replaceAll(workspaceRoot, '$WORKSPACE_ROOT')
    .replaceAll(homedir(), '$HOME')
    .replace(/file:\/\/[^\s"']+/g, 'file://$REDACTED_MEDIA')
  if (device !== undefined) {
    sanitized = sanitized.replaceAll(device, '$DEVICE_ID')
  }
  return sanitized
}

function scrubArguments(args) {
  return args.map((argument, index) => args[index - 1] === '--device' ? '$DEVICE_ID' : argument)
}

function command(commandName, args, label) {
  const startedAt = new Date()
  const result = spawnSync(commandName, args, {
    cwd: clientRoot,
    encoding: 'utf8',
    env: { ...process.env },
    maxBuffer: 20 * 1024 * 1024
  })
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? `${result.error.message}\n` : ''}`
  process.stdout.write(output)
  const sanitized = scrub(output)
  const semanticFailure = /(Compile failed|BUILD FAILED|Error: ENOENT|command not found|is required, .* (null|undefined)|SDK is not installed|Please check .* SDK)/i.test(output)
  const rawExitCode = result.status ?? 1
  return {
    label,
    executable: commandName === aceBin ? 'ace' : commandName,
    arguments: scrubArguments(args),
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    exitCode: rawExitCode === 0 && semanticFailure ? 1 : rawExitCode,
    rawExitCode,
    semanticFailure,
    outputSha256: createHash('sha256').update(sanitized).digest('hex'),
    outputTail: sanitized.slice(-40000)
  }
}

function buildArgs(targetPlatform) {
  if (targetPlatform === 'harmonyos') {
    return ['build', 'hap', '--debug', '--target', 'entry']
  }
  if (targetPlatform === 'android') {
    return ['build', 'apk', '--debug', '--target-platform', 'arm64']
  }
  const args = ['build', 'ios', '--debug']
  if (simulator) {
    args.push('--nosign', '--simulator')
  }
  return args
}

function packageName(targetPlatform) {
  if (targetPlatform === 'harmonyos') return 'hap'
  if (targetPlatform === 'android') return 'apk'
  return 'ios'
}

const selectedPlatforms = platform === 'all' ? allowedPlatforms : [platform]
const results = []
const generatedConfigurationPaths = [
  join(clientRoot, 'local.properties'),
  join(clientRoot, '.arkui-x/android/local.properties')
]
const configurationSnapshots = generatedConfigurationPaths.map((path) => ({
  path,
  existed: existsSync(path),
  content: existsSync(path) ? readFileSync(path) : undefined
}))

if (phase === 'check') {
  results.push(command(process.execPath, ['scripts/toolchain-preflight.mjs'], 'repository toolchain preflight'))
  results.push(command(aceBin, ['--version'], 'ACE Tools version'))
} else if (phase === 'build') {
  for (const targetPlatform of selectedPlatforms) {
    results.push(command(aceBin, buildArgs(targetPlatform), `${targetPlatform} debug build`))
  }
} else {
  results.push(command(aceBin,
    ['run', packageName(platform), '--debug', '--device', device], `${platform} device run`))
}

for (const snapshot of configurationSnapshots) {
  if (snapshot.existed && snapshot.content !== undefined) {
    writeFileSync(snapshot.path, snapshot.content)
  } else if (existsSync(snapshot.path)) {
    rmSync(snapshot.path)
  }
}

mkdirSync(evidenceRoot, { recursive: true })
const finishedAt = new Date()
const report = {
  schemaVersion: 1,
  bundleId: 'com.ziyoufang.client',
  phase,
  platform,
  simulator,
  deviceSpecified: device !== undefined,
  finishedAt: finishedAt.toISOString(),
  passed: results.every((result) => result.exitCode === 0),
  results
}
const filename = `platform-validation-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`
const reportPath = join(evidenceRoot, filename)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Validation evidence: ${reportPath}`)

if (!report.passed) {
  process.exit(1)
}
