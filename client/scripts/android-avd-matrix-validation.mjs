import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptRoot = dirname(fileURLToPath(import.meta.url))
const clientRoot = dirname(scriptRoot)
const workspaceRoot = dirname(clientRoot)
const evidenceRoot = join(workspaceRoot, 'harness/results')
const androidSdk = process.env.ANDROID_HOME || join(homedir(), 'Library/Android/sdk')
const androidAvdHome = process.env.ANDROID_AVD_HOME || join(homedir(), '.android/avd')
const adb = join(androidSdk, 'platform-tools/adb')
const emulator = join(androidSdk, 'emulator/emulator')
const hostValidation = join(scriptRoot, 'android-host-validation.mjs')
const runtimeValidation = join(scriptRoot, 'android-runtime-validation.mjs')
const matrix = [
  { avd: 'ziyoufang_api26_arm64', expectedApiLevel: 26 },
  { avd: 'ziyoufang_api33_arm64', expectedApiLevel: 33 }
]

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function scrub(value) {
  return value
    .replaceAll(clientRoot, '$CLIENT_ROOT')
    .replaceAll(workspaceRoot, '$WORKSPACE_ROOT')
    .replaceAll(homedir(), '$HOME')
    .replace(/emulator-\d+/g, '$DEVICE_ID')
    .replace(/EMULATOR[0-9X]+/g, '$EMULATOR_SERIAL')
}

function command(commandPath, args, options = {}) {
  const result = spawnSync(commandPath, args, {
    cwd: clientRoot,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
    ...options
  })
  const output = `${result.stdout || ''}${result.stderr || ''}` +
    `${result.error ? `${result.error.message}\n` : ''}`
  return { exitCode: result.status ?? 1, output }
}

function onlineEmulators() {
  const result = command(adb, ['devices'])
  if (result.exitCode !== 0) {
    return []
  }
  return result.output.split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => /^emulator-\d+$/.test(serial) && state === 'device')
    .map(([serial]) => serial)
}

async function waitForNewEmulator(existing, child, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return undefined
    }
    const serial = onlineEmulators().find((candidate) => !existing.has(candidate))
    if (serial !== undefined) {
      return serial
    }
    await sleep(1000)
  }
  return undefined
}

async function waitForBoot(serial, child, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return false
    }
    const result = command(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'])
    if (result.exitCode === 0 && result.output.trim() === '1') {
      return true
    }
    await sleep(1000)
  }
  return false
}

async function waitForExit(child, timeoutMs = 15000) {
  if (child.exitCode !== null) {
    return true
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    function onExit() {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

for (const prerequisite of [adb, emulator, hostValidation, runtimeValidation]) {
  if (!existsSync(prerequisite)) {
    throw new Error(`Android AVD matrix prerequisite is missing: ${prerequisite}`)
  }
}
for (const item of matrix) {
  const config = join(androidAvdHome, `${item.avd}.avd/config.ini`)
  if (!existsSync(config)) {
    throw new Error(`Android AVD matrix configuration is missing: ${config}`)
  }
}

const initiallyOnline = onlineEmulators()
if (initiallyOnline.length > 0) {
  throw new Error('Android AVD matrix requires no pre-existing online emulator; close it before running')
}

const startedAt = new Date()
const hostBuild = command(process.execPath, [hostValidation])
process.stdout.write(hostBuild.output)
const results = []

if (hostBuild.exitCode === 0) {
  for (const item of matrix) {
    const existing = new Set(onlineEmulators())
    let emulatorLog = ''
    let serial
    let stopped = false
    const child = spawn(emulator, [
      '-avd', item.avd,
      '-no-window',
      '-no-audio',
      '-no-boot-anim',
      '-gpu', 'swiftshader_indirect',
      '-no-snapshot-save'
    ], {
      cwd: clientRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const appendLog = (chunk) => {
      if (emulatorLog.length < 2 * 1024 * 1024) {
        emulatorLog += chunk.toString()
      }
    }
    child.stdout.on('data', appendLog)
    child.stderr.on('data', appendLog)
    child.on('error', (error) => appendLog(`${error.message}\n`))

    const itemStartedAt = new Date()
    let runtime = { exitCode: 1, output: 'runtime validation did not start\n' }
    let apiLevel = 0
    let release = ''
    try {
      serial = await waitForNewEmulator(existing, child)
      if (serial === undefined) {
        throw new Error(`AVD did not become available: ${item.avd}`)
      }
      if (!await waitForBoot(serial, child)) {
        throw new Error(`AVD did not complete boot: ${item.avd}`)
      }
      apiLevel = Number(command(adb, [
        '-s', serial, 'shell', 'getprop', 'ro.build.version.sdk'
      ]).output.trim())
      release = command(adb, [
        '-s', serial, 'shell', 'getprop', 'ro.build.version.release'
      ]).output.trim()
      runtime = command(process.execPath, [runtimeValidation, '--device', serial])
      process.stdout.write(runtime.output)
    } catch (error) {
      runtime = {
        exitCode: 1,
        output: `${error instanceof Error ? error.message : String(error)}\n`
      }
    } finally {
      if (serial !== undefined) {
        command(adb, ['-s', serial, 'emu', 'kill'])
      }
      stopped = await waitForExit(child)
      if (!stopped && child.exitCode === null) {
        child.kill('SIGTERM')
        stopped = await waitForExit(child, 5000)
      }
    }

    const sanitizedRuntimeOutput = scrub(runtime.output)
    const sanitizedEmulatorLog = scrub(emulatorLog)
    const passed = apiLevel === item.expectedApiLevel && runtime.exitCode === 0 && stopped
    results.push({
      avd: item.avd,
      expectedApiLevel: item.expectedApiLevel,
      apiLevel,
      release,
      device: serial === undefined ? undefined : '$DEVICE_ID',
      durationMs: Date.now() - itemStartedAt.getTime(),
      runtimeExitCode: runtime.exitCode,
      runtimeOutputTail: sanitizedRuntimeOutput.slice(-12000),
      runtimeOutputSha256: createHash('sha256').update(sanitizedRuntimeOutput).digest('hex'),
      emulatorOutputSha256: createHash('sha256').update(sanitizedEmulatorLog).digest('hex'),
      emulatorStopped: stopped,
      passed
    })
    console.log(`${item.avd}: ${passed ? 'PASS' : 'FAIL'} (API ${apiLevel || 'unknown'})`)
  }
}

const finishedAt = new Date()
const report = {
  schemaVersion: 1,
  scope: 'android-api26-api33-native-host-avd-runtime-matrix',
  excludes: [
    'complete ArkUI-X application packaging',
    'rendered ArkTS product flow',
    'physical camera capture',
    'Android physical-device compatibility'
  ],
  avdsOwnedByRunner: true,
  preExistingEmulatorsAllowed: false,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  hostBuildExitCode: hostBuild.exitCode,
  hostBuildOutputSha256: createHash('sha256').update(scrub(hostBuild.output)).digest('hex'),
  passed: hostBuild.exitCode === 0 && results.length === matrix.length &&
    results.every((result) => result.passed),
  results
}

mkdirSync(evidenceRoot, { recursive: true })
const reportPath = join(evidenceRoot,
  `android-avd-matrix-validation-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Android AVD matrix passed ${results.filter((result) => result.passed).length}/${matrix.length}`)
console.log(`Validation evidence: ${reportPath}`)
if (!report.passed) {
  process.exit(1)
}
