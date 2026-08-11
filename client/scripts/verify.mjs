import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const failures = []
const passes = []

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function check(label, condition, detail = '') {
  if (condition) {
    passes.push(label)
  } else {
    failures.push(`${label}${detail ? `: ${detail}` : ''}`)
  }
}

function filesUnder(path) {
  const absolute = join(root, path)
  const output = []
  for (const name of readdirSync(absolute)) {
    const child = join(absolute, name)
    if (statSync(child).isDirectory()) {
      if (['build', '.gradle', 'node_modules', 'oh_modules'].includes(name)) {
        continue
      }
      output.push(...filesUnder(relative(root, child)))
    } else {
      output.push(relative(root, child))
    }
  }
  return output
}

const appScope = read('AppScope/app.json5')
const buildProfile = read('build-profile.json5')
const moduleProfile = read('entry/src/main/module.json5')
const androidBuild = read('.arkui-x/android/app/build.gradle')
const androidProperties = read('.arkui-x/android/gradle.properties')
const androidManifest = read('.arkui-x/android/app/src/main/AndroidManifest.xml')
const iosProject = read('.arkui-x/ios/app.xcodeproj/project.pbxproj')
const iosInfo = read('.arkui-x/ios/app/Info.plist')
const androidNative = filesUnder('.arkui-x/android/app/src/main/java').map(read).join('\n')
const androidInstrumentedTest = filesUnder('.arkui-x/android/app/src/androidTest/java').map(read).join('\n')
const iosNative = filesUnder('.arkui-x/ios/app')
  .filter((path) => /\.[hm]$/.test(path)).map(read).join('\n')
const iosResourcesPhase = iosProject.split('/* Begin PBXResourcesBuildPhase section */')[1]
  .split('/* End PBXResourcesBuildPhase section */')[0]
const iosAppIcon = JSON.parse(read('.arkui-x/ios/app/Assets.xcassets/AppIcon.appiconset/Contents.json'))
const architectureSources = filesUnder('entry/src/main/ets').map(read).join('\n')
const pageSources = filesUnder('entry/src/main/ets/pages').map(read).join('\n')
const mockPracticeData = read('entry/src/main/ets/domain/MockPracticeData.ets')
const contract = JSON.parse(read('contracts/client-capabilities.json'))
const platformValidation = read('scripts/platform-validation.mjs')
const androidHostValidation = read('scripts/android-host-validation.mjs')
const androidRuntimeValidation = read('scripts/android-runtime-validation.mjs')
const androidAvdMatrixValidation = read('scripts/android-avd-matrix-validation.mjs')
const iosHostSourceValidation = read('scripts/ios-host-source-validation.mjs')
const arktsCoreValidation = read('scripts/arkts-core-validation.mjs')
const arkuiSyntaxValidation = read('scripts/arkui-syntax-validation.mjs')
const arkuiTransformValidation = read('scripts/arkui-transform-validation.mjs')
const arktsSemanticValidation = read('scripts/arkts-semantic-validation.mjs')
const toolchainPreflight = read('scripts/toolchain-preflight.mjs')
const toolchainRecovery = read('../harness/validation/toolchain-recovery.md')

check('ArkUI-X cross-platform project flag', read('.arkui-x/arkui-x-config.json5').includes('"crossplatform": true'))
check('shared bundle identifier', appScope.includes('com.ziyoufang.client') &&
  androidBuild.includes('com.ziyoufang.client') && iosProject.includes('com.ziyoufang.client'))

check('HarmonyOS API 20 compile baseline', buildProfile.includes('"compileSdkVersion": "6.0.0(20)"'))
check('HarmonyOS API 20 compatibility baseline', buildProfile.includes('"compatibleSdkVersion": "6.0.0(20)"'))
check('HarmonyOS camera permission', moduleProfile.includes('ohos.permission.CAMERA'))
check('HarmonyOS photo permission', moduleProfile.includes('ohos.permission.READ_IMAGEVIDEO'))
check('HarmonyOS network permission', moduleProfile.includes('ohos.permission.INTERNET'))

check('Android API 26 minimum', /minSdkVersion\s+26/.test(androidBuild))
check('Android API 33 compile baseline', /compileSdkVersion\s+33/.test(androidBuild))
check('AndroidX enabled', androidProperties.includes('android.useAndroidX=true'))
check('Android CameraX locked', androidBuild.includes('androidx.camera:camera-view:1.2.3'))
check('Android native dependencies locked', androidBuild.includes('androidx.activity:activity:1.7.2') &&
  androidBuild.includes('androidx.core:core:1.10.1') &&
  androidBuild.includes('androidx.exifinterface:exifinterface:1.3.6') &&
  androidBuild.includes("org.jetbrains.kotlin:kotlin-bom:1.8.10"))
check('Android camera permission', androidManifest.includes('android.permission.CAMERA'))
check('Android internet permission', androidManifest.includes('android.permission.INTERNET'))
check('Android capture activity is private', androidManifest.includes('android:name=".CameraCaptureActivity"') &&
  androidManifest.includes('android:exported="false"'))
check('Android CameraX capture host', androidNative.includes('ProcessCameraProvider') &&
  androidNative.includes('ImageCapture.OutputFileOptions') && androidNative.includes('PracticeGridOverlay'))
check('Android bridge is registered', androidNative.includes('new ZiYouFangCameraBridge') &&
  androidNative.includes('onActivityResult') && androidNative.includes('onRequestPermissionsResult'))
check('Android capture distinguishes errors', androidNative.includes('EXTRA_ERROR_CODE') &&
  androidNative.includes('CAMERA_CAPTURE_FAILED'))
check('Android instrumented test uses AndroidX and the application bundle',
  androidInstrumentedTest.includes('androidx.test.platform.app.InstrumentationRegistry') &&
  androidInstrumentedTest.includes('com.ziyoufang.client') &&
  androidInstrumentedTest.includes('nativeCameraPageLaunchesWithGrantedPermission') &&
  androidInstrumentedTest.includes('CameraCaptureActivity.class') &&
  !androidInstrumentedTest.includes('android.support.test'))

check('iOS 13 minimum only', iosProject.includes('IPHONEOS_DEPLOYMENT_TARGET = 13.0;') &&
  !/IPHONEOS_DEPLOYMENT_TARGET = (10|11|12)\./.test(iosProject))
check('iOS camera privacy string', iosInfo.includes('NSCameraUsageDescription'))
check('iOS photo privacy string', iosInfo.includes('NSPhotoLibraryUsageDescription'))
check('iOS AVFoundation linked', iosProject.includes('AVFoundation.framework in Frameworks'))
check('iOS native sources are build sources', iosProject.includes('ZiYouFangCameraBridge.m in Sources') &&
  iosProject.includes('ZiYouFangCameraViewController.m in Sources') &&
  !iosResourcesPhase.includes('ZiYouFangCamera'))
check('iOS AVFoundation capture host', iosNative.includes('AVCapturePhotoOutput') &&
  iosNative.includes('AVCaptureVideoPreviewLayer') && iosNative.includes('ZiYouFangPracticeGridView'))
check('iOS bridge is registered', iosNative.includes('initBridgePlugin:@"ZiYouFangCamera"') &&
  iosNative.includes('requestCameraPermission') && iosNative.includes('startCapture'))

for (const service of contract.requiredServices) {
  check(`service contract ${service}`, architectureSources.includes(`interface ${service}`))
}
for (const state of contract.taskStates) {
  check(`task state ${state}`, architectureSources.includes(`'${state}'`))
}

check('responsive compact breakpoint', architectureSources.includes('COMPACT_MAX_VP: number = 599'))
check('responsive medium breakpoint', architectureSources.includes('MEDIUM_MIN_VP: number = 600'))
check('responsive expanded breakpoint', architectureSources.includes('EXPANDED_MIN_VP: number = 840'))
check('bottom navigation has central capture', pageSources.includes("Button('拍照上传')"))
check('notebook is under Mine', pageSources.includes("Text('字本')") && pageSources.includes("Text('我的')"))
check('multi-character result list', architectureSources.includes('SAMPLE_CHARACTER_RESULTS') &&
  architectureSources.includes('ResultWorkspace'))
check('prototype result list contains sixteen fixture characters',
  (mockPracticeData.match(/new CharacterResult\(/g) || []).length === 16 &&
  pageSources.includes('SAMPLE_CHARACTER_RESULTS.length.toString()'))
check('prototype result list covers all four categories',
  ['NORMAL', 'WRONG', 'UNATTRACTIVE', 'UNCERTAIN'].every((category) =>
    mockPracticeData.includes(`CharacterCategory.${category}`)))
check('uncertain results never display a numeric score',
  architectureSources.includes("return '待确认'") &&
  architectureSources.includes('result.score === undefined') &&
  mockPracticeData.includes("'地', '地', '', 'songti-v1', undefined"))
check('removed features absent from application source', !/(教师复核|周报|月报|季度报|年报)/.test(architectureSources))
check('platform APIs do not leak into pages', !/(android\.|UIKit|AVFoundation|CameraX)/.test(pageSources))
check('cross-platform photo picker adapter', architectureSources.includes('@ohos.file.photoAccessHelper') &&
  architectureSources.includes('PhotoViewPicker'))
check('cross-platform file adapter', architectureSources.includes('@ohos.file.fs') &&
  architectureSources.includes('copyFileSync'))
check('cross-platform capacity adapter', architectureSources.includes('@ohos.file.statvfs') &&
  architectureSources.includes('getFreeSize'))
check('cross-platform relational store adapter', architectureSources.includes('@ohos.data.relationalStore') &&
  architectureSources.includes('RdbPracticeRepository') && architectureSources.includes('DATABASE_VERSION'))
check('cross-platform preferences adapter', architectureSources.includes('@ohos.data.preferences') &&
  architectureSources.includes('ArkUiXSettingsStore'))
check('cross-platform net.http adapter', architectureSources.includes('@ohos.net.http') &&
  architectureSources.includes('NetHttpAssessmentClient'))
check('multipart upload uses idempotency and progress', architectureSources.includes('multiFormDataList') &&
  architectureSources.includes('Idempotency-Key') && architectureSources.includes('dataSendProgress'))
check('camera remains behind a platform bridge', architectureSources.includes('interface PlatformCameraBridge') &&
  architectureSources.includes('ArkUiXCaptureService'))
check('native bridge is wired to capture page', architectureSources.includes("createBridge('ZiYouFangCamera')") &&
  pageSources.includes('createCaptureService') && pageSources.includes('requestCameraPermission'))
check('capture confirmation supports retake', pageSources.includes("Button('重新拍摄')") &&
  pageSources.includes("Button('使用照片')") && pageSources.includes('pendingResult'))
check('HarmonyOS Camera Kit capture host', architectureSources.includes('@ohos.multimedia.cameraPicker') &&
  architectureSources.includes('cameraPicker.pick') && architectureSources.includes('CAMERA_POSITION_BACK'))
check('platform capture factory', architectureSources.includes("platform === 'Android' || platform === 'iOS'") &&
  architectureSources.includes('new HarmonyCameraBridge(context)'))
check('no model API key committed', !/(sk-[A-Za-z0-9_-]{16,}|OPENAI_API_KEY\s*=)/.test(filesUnder('.')
  .filter((path) => /\.(ets|ts|js|mjs|java|m|h|json|json5|xml|gradle|md|ya?ml|plist|pbxproj|properties)$/.test(path))
  .map((path) => {
  try { return read(path) } catch { return '' }
}).join('\n')))
check('logs avoid student and media fields', !/(hilog|console)\.(info|warn|error|debug)[^\n]*(studentId|imageUri|cropUri|recognizedCharacter|expectedCharacter)/.test(architectureSources))
check('native hosts do not log media paths or assessment content',
  !/(Log\.|ALog\.|NSLog)[^\n]*(fileURL|absolutePath|student|recognizedCharacter|expectedCharacter)/.test(
    `${androidNative}\n${iosNative}`))
check('platform evidence runner detects false-success builds',
  platformValidation.includes('semanticFailure') &&
  platformValidation.includes('Compile failed') &&
  platformValidation.includes('rawExitCode'))
check('platform evidence runner redacts device and media identifiers',
  platformValidation.includes('$DEVICE_ID') &&
  platformValidation.includes('$REDACTED_MEDIA') &&
  platformValidation.includes('outputSha256'))
check('Android host compiler has a scoped evidence runner',
  androidHostValidation.includes("scope: 'android-native-host-debug-apk-and-tests'") &&
  androidHostValidation.includes("'public ArkTS compilation'") &&
  androidHostValidation.includes("'complete ArkUI-X application packaging'") &&
  androidHostValidation.includes("'assembleDebug'") &&
  androidHostValidation.includes("'assembleDebugAndroidTest'") &&
  androidHostValidation.includes('sha256') &&
  androidHostValidation.includes('outputSha256') &&
  read('scripts/android-host-validation.gradle').includes('arkuix-validation-jni') &&
  read('scripts/android-host-validation.gradle').includes('Nothing from the vendor SDK is copied'))
check('Android runtime runner is explicit, scoped and evidence-producing',
  androidRuntimeValidation.includes('requires an explicit --device identifier') &&
  androidRuntimeValidation.includes("apiLevel === 26 || apiLevel === 33") &&
  androidRuntimeValidation.includes("'shell', 'am', 'instrument'") &&
  androidRuntimeValidation.includes("'physical camera capture'") &&
  androidRuntimeValidation.includes('android-runtime-validation-api'))
check('Android AVD matrix owns and validates API 26/33 emulators safely',
  androidAvdMatrixValidation.includes('android-api26-api33-native-host-avd-runtime-matrix') &&
  androidAvdMatrixValidation.includes("avd: 'ziyoufang_api26_arm64'") &&
  androidAvdMatrixValidation.includes("avd: 'ziyoufang_api33_arm64'") &&
  androidAvdMatrixValidation.includes('requires no pre-existing online emulator') &&
  androidAvdMatrixValidation.includes("'emu', 'kill'") &&
  androidAvdMatrixValidation.includes("'physical camera capture'") &&
  androidAvdMatrixValidation.includes('android-avd-matrix-validation-'))
check('iOS host source checker is explicit, scoped and evidence-producing',
  iosHostSourceValidation.includes('ios-objective-c-host-object-compilation-via-command-line-tools-maccatalyst-headers') &&
  iosHostSourceValidation.includes("'iPhoneOS or iPhoneSimulator SDK compilation'") &&
  iosHostSourceValidation.includes("'iOS 13 availability analysis'") &&
  iosHostSourceValidation.includes("'-c'") &&
  iosHostSourceValidation.includes("'-fobjc-arc'") &&
  iosHostSourceValidation.includes('objectArtifacts') &&
  iosHostSourceValidation.includes('outputSha256'))
check('official Ark compiler runner has an explicit non-UI scope',
  arktsCoreValidation.includes('official-openharmony-ark-compiler-for-non-ui-arkts-core') &&
  arktsCoreValidation.includes("'ArkUI declarative page and component transformation'") &&
  arktsCoreValidation.includes("'--target-api-version', '20'") &&
  arktsCoreValidation.includes('abcSha256'))
check('official ArkUI syntax runner has an explicit validation-only scope',
  arkuiSyntaxValidation.includes('official-openharmony-ets-loader-ui-syntax-validation') &&
  arkuiSyntaxValidation.includes("'ArkUI transformed code generation'") &&
  arkuiSyntaxValidation.includes("'ArkTS semantic type checking'") &&
  arkuiSyntaxValidation.includes("entryPages.has(pageName) ? '?entry' : ''") &&
  arkuiSyntaxValidation.includes('processedSha256'))
check('official ArkUI transform runner generates UI bytecode with explicit exclusions',
  arkuiTransformValidation.includes('official-openharmony-ets-loader-ui-transformation-and-ark-bytecode-compilation') &&
  arkuiTransformValidation.includes("'hvigor project model and integrated module resolution'") &&
  arkuiTransformValidation.includes("'platform resource compilation and production resource ID assignment'") &&
  arkuiTransformValidation.includes("join(loaderRoot, 'tsconfig.json')") &&
  arkuiTransformValidation.includes("includes('ForEach')") &&
  arkuiTransformValidation.includes('processUISyntax') &&
  arkuiTransformValidation.includes('transformedSha256') &&
  arkuiTransformValidation.includes('abcSha256'))
check('official ArkTS semantic runner separates project and SDK linter diagnostics',
  arktsSemanticValidation.includes('official-openharmony-ets-project-source-syntactic-semantic-and-linter-checker') &&
  arktsSemanticValidation.includes("'external SDK declaration restricted-syntax diagnostics (reported separately)'") &&
  arktsSemanticValidation.includes("'complete ArkUI-X application packaging'") &&
  arktsSemanticValidation.includes("executeArkTSLinter = validationMode === 'linter'") &&
  arktsSemanticValidation.includes('projectLinterErrors') &&
  arktsSemanticValidation.includes('outputSha256'))
check('toolchain preflight covers DevEco aliases and three device families',
  toolchainPreflight.includes('DevEco-Studio.app') &&
  toolchainPreflight.includes('OpenHarmony public SDK 6.0.0.47/API 20') &&
  toolchainPreflight.includes('OpenHarmony SDK license record') &&
  toolchainPreflight.includes("['hvigor'") &&
  toolchainPreflight.includes('Connected Android device') &&
  toolchainPreflight.includes('Connected HarmonyOS device') &&
  toolchainPreflight.includes('Connected iOS device'))
check('toolchain recovery preserves account and evidence boundaries',
  toolchainRecovery.includes('账号登录、许可确认和验证码必须由账号持有人完成') &&
  toolchainRecovery.includes('不证明完整 ArkTS 或完整 ArkUI-X APK') &&
  toolchainRecovery.includes('不得自动选择设备'))

for (const icon of [
  'AppScope/resources/base/media/app_icon.png',
  'entry/src/main/resources/base/media/icon.png',
  '.arkui-x/android/app/src/main/res/drawable/app_icon.png',
  '.arkui-x/ios/app/Assets.xcassets/AppIcon.appiconset/icon-1024.png'
]) {
  check(`app icon ${icon}`, existsSync(join(root, icon)) && statSync(join(root, icon)).size > 1024)
}

for (const image of iosAppIcon.images) {
  check(`declared iOS icon ${image.filename}`,
    typeof image.filename === 'string' &&
      existsSync(join(root, '.arkui-x/ios/app/Assets.xcassets/AppIcon.appiconset', image.filename)))
}

console.log('ZiYouFang cross-platform static verification')
console.log(`PASS ${passes.length}`)
for (const label of passes) {
  console.log(`  ✓ ${label}`)
}

if (failures.length > 0) {
  console.error(`FAIL ${failures.length}`)
  for (const failure of failures) {
    console.error(`  ✗ ${failure}`)
  }
  process.exit(1)
}

console.log('All static platform and architecture checks passed.')
