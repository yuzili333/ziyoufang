import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = dirname(clientRoot)
const evidenceRoot = join(workspaceRoot, 'harness/results')
const androidSdk = process.env.ANDROID_HOME || join(homedir(), 'Library/Android/sdk')
const adb = join(androidSdk, 'platform-tools/adb')
const appApk = join(clientRoot, '.arkui-x/android/app/build/outputs/apk/debug/app-debug.apk')
const testApk = join(clientRoot,
  '.arkui-x/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')
const bundleId = 'com.ziyoufang.client'
const launcher = `${bundleId}/.EntryEntryAbilityActivity`
const runner = `${bundleId}.test/androidx.test.runner.AndroidJUnitRunner`

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const device = option('--device')
if (device === undefined || device.trim().length === 0) {
  throw new Error('Android runtime validation requires an explicit --device identifier')
}

for (const prerequisite of [adb, appApk, testApk]) {
  if (!existsSync(prerequisite)) {
    throw new Error(`Android runtime prerequisite is missing: ${prerequisite}`)
  }
}

function scrub(value) {
  return value
    .replaceAll(clientRoot, '$CLIENT_ROOT')
    .replaceAll(workspaceRoot, '$WORKSPACE_ROOT')
    .replaceAll(homedir(), '$HOME')
    .replaceAll(device, '$DEVICE_ID')
}

function run(args, label, printOutput = true) {
  const startedAt = new Date()
  const result = spawnSync(adb, ['-s', device, ...args], {
    cwd: clientRoot,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  })
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? `${result.error.message}\n` : ''}`
  if (printOutput) {
    process.stdout.write(output)
  }
  const sanitized = scrub(output)
  return {
    label,
    arguments: ['-s', '$DEVICE_ID', ...args.map((value) => scrub(value))],
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    exitCode: result.status ?? 1,
    output: sanitized,
    outputSha256: createHash('sha256').update(sanitized).digest('hex')
  }
}

const steps = []
steps.push(run(['wait-for-device'], 'wait for explicit Android device'))
const apiStep = run(['shell', 'getprop', 'ro.build.version.sdk'], 'read Android API level')
steps.push(apiStep)
const releaseStep = run(['shell', 'getprop', 'ro.build.version.release'], 'read Android release')
steps.push(releaseStep)
const apiLevel = Number(apiStep.output.trim())

steps.push(run(['install', '-r', appApk], 'install native host debug APK'))
steps.push(run(['install', '-r', testApk], 'install native host instrumentation APK'))
steps.push(run(['shell', 'am', 'force-stop', bundleId], 'stop previous native host process'))
const launchStep = run(['shell', 'am', 'start', '-W', '-n', launcher], 'launch native host activity')
steps.push(launchStep)
const pidStep = run(['shell', 'pidof', bundleId], 'confirm native host process')
steps.push(pidStep)
const resumedStep = run([
  'shell', 'dumpsys', 'activity', 'activities'
], 'inspect resumed activity', false)
steps.push({
  ...resumedStep,
  output: resumedStep.output.split('\n')
    .filter((line) => line.includes('mResumedActivity') || line.includes(launcher.split('/')[1]))
    .slice(0, 20)
    .join('\n')
})
const instrumentationStep = run([
  'shell', 'am', 'instrument', '-w', runner
], 'run Android native host instrumentation tests')
steps.push(instrumentationStep)

const supportedBaseline = apiLevel === 26 || apiLevel === 33
const hasResumedActivity = /(mResumedActivity|topResumedActivity|ResumedActivity)/
  .test(resumedStep.output) && resumedStep.output.includes(bundleId)
const passed = supportedBaseline && steps.every((step) => step.exitCode === 0) &&
  /Success/.test(steps[3].output) && /Success/.test(steps[4].output) &&
  /Status: ok/.test(launchStep.output) && pidStep.output.trim().length > 0 &&
  hasResumedActivity &&
  /OK \(2 tests\)/.test(instrumentationStep.output)

const finishedAt = new Date()
const report = {
  schemaVersion: 1,
  scope: 'android-native-host-install-launch-camera-page-and-instrumentation',
  excludes: [
    'public ArkTS compilation',
    'complete ArkUI-X application packaging',
    'rendered ArkTS product flow',
    'physical camera capture'
  ],
  bundleId,
  deviceSpecified: true,
  device: '$DEVICE_ID',
  apiLevel,
  release: releaseStep.output.trim(),
  supportedBaseline,
  finishedAt: finishedAt.toISOString(),
  passed,
  artifacts: [appApk, testApk].map((path) => ({
    path: scrub(path),
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
  })),
  steps: steps.map(({ output, ...step }) => ({
    ...step,
    outputTail: output.slice(-12000)
  }))
}

mkdirSync(evidenceRoot, { recursive: true })
const filename = `android-runtime-validation-api${apiLevel}-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`
const reportPath = join(evidenceRoot, filename)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Validation evidence: ${reportPath}`)

if (!passed) {
  process.exit(1)
}
