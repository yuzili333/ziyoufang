import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const home = homedir()
const arkuiRoot = process.env.ARKUIX_SDK_HOME || join(home, 'Library/ArkUI-X/Sdk')
const androidRoot = process.env.ANDROID_HOME || join(home, 'Library/Android/sdk')
const harmonyRoot = process.env.HARMONYOS_HOME || join(home, 'Library/Huawei/Sdk')
const openHarmonyRoot = process.env.OPENHARMONY_HOME || process.env.OpenHarmony_HOME ||
  join(home, 'Library/OpenHarmony/Sdk')
const expectedArkuiManifest = join(arkuiRoot, '20/arkui-x/arkui-x.json')
const expectedOpenHarmonyApi = '20'
const expectedOpenHarmonyVersion = '6.0.0.47'
const openHarmonyComponents = ['ets', 'js', 'native', 'previewer', 'toolchains']
const aceBin = process.env.ACE_BIN || join(home, '.npm-global/bin/ace')
const devecoCliBin = process.env.DEVECO_CLI_BIN || join(home, '.npm-global/bin/devecocli')

function firstExisting(paths) {
  return paths.find((path) => existsSync(path))
}

function commandVersion(command, args, env = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
  if (result.status !== 0) {
    return undefined
  }
  return `${result.stdout || ''}${result.stderr || ''}`.trim().split('\n')[0]
}

function arkuiVersion() {
  if (!existsSync(expectedArkuiManifest)) {
    return undefined
  }
  try {
    return JSON.parse(readFileSync(expectedArkuiManifest, 'utf8')).version
  } catch {
    return undefined
  }
}

function hasOpenHarmonyPublicSdk() {
  return openHarmonyComponents.every((component) => {
    const manifest = join(openHarmonyRoot, expectedOpenHarmonyApi, component, 'oh-uni-package.json')
    if (!existsSync(manifest)) return false
    try {
      const data = JSON.parse(readFileSync(manifest, 'utf8'))
      return data.apiVersion === expectedOpenHarmonyApi && data.version === expectedOpenHarmonyVersion
    } catch {
      return false
    }
  })
}

function hasConnectedAndroidDevice(adb) {
  if (!existsSync(adb)) return false
  const result = spawnSync(adb, ['devices'], { encoding: 'utf8' })
  return result.status === 0 && result.stdout.split('\n').some((line) => /\tdevice$/.test(line.trim()))
}

function hasConnectedIosDevice() {
  const result = spawnSync('idevice_id', ['-l'], { encoding: 'utf8' })
  return result.status === 0 && result.stdout.trim().length > 0
}

function hasConnectedHarmonyDevice(hdc) {
  if (hdc === undefined) return false
  const result = spawnSync(hdc, ['list', 'targets'], { encoding: 'utf8' })
  if (result.status !== 0) return false
  return result.stdout.split('\n').some((line) => {
    const value = line.trim()
    return value.length > 0 && value !== '[Empty]'
  })
}

const javaHome = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
const javaVersion = commandVersion(join(javaHome, 'bin/java'), ['-version'])
const devecoStudio = firstExisting([
  '/Applications/DevEco-Studio.app',
  '/Applications/DevEco Studio.app',
  join(home, 'Applications/DevEco-Studio.app'),
  join(home, 'Applications/DevEco Studio.app')
])
const embeddedHarmonyRoot = devecoStudio === undefined ? undefined : join(devecoStudio, 'Contents/sdk/default/harmonyos')
const resolvedHarmonyRoot = existsSync(harmonyRoot) ? harmonyRoot :
  (embeddedHarmonyRoot !== undefined && existsSync(embeddedHarmonyRoot) ? embeddedHarmonyRoot : harmonyRoot)
const embeddedOhpm = devecoStudio === undefined ? undefined : firstExisting([
  join(devecoStudio, 'Contents/tools/ohpm/bin/ohpm'),
  join(devecoStudio, 'Contents/tools/ohpm/ohpm')
])
const ohpmVersion = embeddedOhpm === undefined ? commandVersion('ohpm', ['--version']) :
  commandVersion(embeddedOhpm, ['--version'])
const commandLineTools = process.env.DEVECO_CLI_CLT_PATH
const hvigor = firstExisting([
  ...(commandLineTools === undefined ? [] : [join(commandLineTools, 'bin/hvigorw')]),
  ...(devecoStudio === undefined ? [] : [join(devecoStudio, 'Contents/tools/hvigor/bin/hvigorw')])
])
const androidAdb = join(androidRoot, 'platform-tools/adb')
const androidEmulator = join(androidRoot, 'emulator/emulator')
const androidAvdRoot = process.env.ANDROID_AVD_HOME || join(home, '.android/avd')
const harmonyHdc = firstExisting([
  join(resolvedHarmonyRoot, 'toolchains/hdc'),
  ...(devecoStudio === undefined ? [] : [join(devecoStudio, 'Contents/sdk/default/openharmony/toolchains/hdc')]),
  join(openHarmonyRoot, expectedOpenHarmonyApi, 'toolchains/hdc')
]) || 'hdc'
const checks = [
  ['ArkUI-X SDK 6.0.0.103', arkuiVersion() === '6.0.0.103', expectedArkuiManifest],
  ['ArkUI-X license record', existsSync(join(arkuiRoot, 'licenses')), join(arkuiRoot, 'licenses')],
  ['OpenHarmony public SDK 6.0.0.47/API 20', hasOpenHarmonyPublicSdk(), openHarmonyRoot],
  ['OpenHarmony SDK license record', existsSync(join(openHarmonyRoot, 'licenses')), join(openHarmonyRoot, 'licenses')],
  ['ACE Tools 1.0.0', commandVersion(aceBin, ['--version']) === '1.0.0', aceBin],
  ['DevEco CLI 1.2.0-stable', commandVersion(devecoCliBin, ['--version']) === '1.2.0-stable', devecoCliBin],
  ['Node.js 18+', Number(process.versions.node.split('.')[0]) >= 18, process.version],
  ['JDK 17', Boolean(javaVersion && /17\./.test(javaVersion)), javaHome],
  ['Android platform tools', existsSync(androidAdb), androidRoot],
  ['Android API 33', existsSync(join(androidRoot, 'platforms/android-33/android.jar')), androidRoot],
  ['Android build tools 30.0.3', existsSync(join(androidRoot, 'build-tools/30.0.3')), androidRoot],
  ['Android emulator', existsSync(androidEmulator), androidEmulator],
  ['Android API 26 arm64 system image',
    existsSync(join(androidRoot, 'system-images/android-26/default/arm64-v8a/package.xml')), androidRoot],
  ['Android API 33 arm64 system image',
    existsSync(join(androidRoot, 'system-images/android-33/default/arm64-v8a/package.xml')), androidRoot],
  ['Android API 26/33 baseline AVDs',
    existsSync(join(androidAvdRoot, 'ziyoufang_api26_arm64.avd/config.ini')) &&
      existsSync(join(androidAvdRoot, 'ziyoufang_api33_arm64.avd/config.ini')), androidAvdRoot],
  ['HarmonyOS SDK', existsSync(resolvedHarmonyRoot), resolvedHarmonyRoot],
  ['DevEco Studio', devecoStudio !== undefined, devecoStudio || '/Applications/DevEco-Studio.app'],
  ['ohpm', Boolean(ohpmVersion), embeddedOhpm || 'PATH'],
  ['hvigor', hvigor !== undefined, hvigor || 'DevEco Studio/Command Line Tools'],
  ['Full Xcode', existsSync('/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild'), '/Applications/Xcode.app'],
  ['libimobiledevice', Boolean(commandVersion('idevice_id', ['--version'])), 'PATH'],
  ['ios-deploy', Boolean(commandVersion('ios-deploy', ['--version'])), 'PATH'],
  ['Connected Android device', hasConnectedAndroidDevice(androidAdb), 'adb devices'],
  ['Connected HarmonyOS device', hasConnectedHarmonyDevice(harmonyHdc), 'hdc list targets'],
  ['Connected iOS device', hasConnectedIosDevice(), 'idevice_id -l']
]

console.log('ZiYouFang three-platform toolchain preflight')
for (const [label, ready, detail] of checks) {
  console.log(`${ready ? 'READY  ' : 'PENDING'} ${label} (${detail})`)
}

const pending = checks.filter(([, ready]) => !ready)
console.log(`\nREADY ${checks.length - pending.length}/${checks.length}; PENDING ${pending.length}/${checks.length}`)
if (pending.length > 0) {
  process.exit(1)
}
