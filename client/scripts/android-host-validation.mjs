import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = dirname(clientRoot)
const androidRoot = join(clientRoot, '.arkui-x/android')
const home = homedir()
const javaHome = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home'
const androidSdk = process.env.ANDROID_HOME || join(home, 'Library/Android/sdk')
const arkuiSdk = process.env.ARKUIX_SDK_HOME || join(home, 'Library/ArkUI-X/Sdk')
const evidenceRoot = join(workspaceRoot, 'harness/results')
const debugApk = join(androidRoot, 'app/build/outputs/apk/debug/app-debug.apk')
const debugTestApk = join(androidRoot, 'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')

const prerequisites = [
  join(javaHome, 'bin/java'),
  join(androidSdk, 'platforms/android-33/android.jar'),
  join(androidSdk, 'build-tools/30.0.3/aapt'),
  join(arkuiSdk, '20/arkui-x/engine/lib/arkui/arkui_android_adapter.jar'),
  join(androidRoot, 'gradlew')
]
const missing = prerequisites.filter((path) => !existsSync(path))
if (missing.length > 0) {
  console.error('Android host validation prerequisites are incomplete:')
  missing.forEach((path) => console.error(`- ${path}`))
  process.exit(1)
}

const startedAt = new Date()
const result = spawnSync('bash', [
  './gradlew',
  '-I',
  '../../scripts/android-host-validation.gradle',
  'compileDebugJavaWithJavac',
  'compileDebugAndroidTestJavaWithJavac',
  'testDebugUnitTest',
  'assembleDebug',
  'assembleDebugAndroidTest'
], {
  cwd: androidRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidSdk,
    ARKUIX_SDK_HOME: arkuiSdk
  },
  maxBuffer: 20 * 1024 * 1024
})
const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? `${result.error.message}\n` : ''}`
process.stdout.write(output)
const sanitized = output
  .replaceAll(clientRoot, '$CLIENT_ROOT')
  .replaceAll(workspaceRoot, '$WORKSPACE_ROOT')
  .replaceAll(home, '$HOME')
const finishedAt = new Date()
const hasDebugApk = existsSync(debugApk)
const hasDebugTestApk = existsSync(debugTestApk)
function artifact(path, redactedPath) {
  return {
    path: redactedPath,
    bytes: statSync(path).size,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
  }
}
const report = {
  schemaVersion: 1,
  scope: 'android-native-host-debug-apk-and-tests',
  excludes: ['public ArkTS compilation', 'complete ArkUI-X application packaging', 'installation', 'device runtime'],
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  exitCode: result.status ?? 1,
  passed: result.status === 0 && /BUILD SUCCESSFUL/.test(output) && hasDebugApk && hasDebugTestApk,
  artifacts: [
    ...(hasDebugApk ? [artifact(debugApk,
      '$CLIENT_ROOT/.arkui-x/android/app/build/outputs/apk/debug/app-debug.apk')] : []),
    ...(hasDebugTestApk ? [artifact(debugTestApk,
      '$CLIENT_ROOT/.arkui-x/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')] : [])
  ],
  outputSha256: createHash('sha256').update(sanitized).digest('hex'),
  outputTail: sanitized.slice(-20000)
}
mkdirSync(evidenceRoot, { recursive: true })
const filename = `android-host-validation-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`
const reportPath = join(evidenceRoot, filename)
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Validation evidence: ${reportPath}`)

if (!report.passed) {
  process.exit(1)
}
