import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const json = (path) => JSON.parse(read(path))

const required = [
  'project.config.json',
  'miniprogram/app.ts',
  'miniprogram/app.json',
  'miniprogram/pages/practice/index.ts',
  'miniprogram/pages/results/index.ts',
  'miniprogram/pages/mine/index.ts',
  'miniprogram/pages/wordbook/index.ts',
  'miniprogram/pages/growth/index.ts',
  'miniprogram/pages/consent/index.ts',
  'miniprogram/pages/upload-confirm/index.ts',
  'miniprogram/pages/progress/index.ts',
  'miniprogram/pages/feedback/index.ts',
  'miniprogram/pages/feedback-history/index.ts',
  'miniprogram/pages/share-confirm/index.ts',
  'miniprogram/pages/shared-card/index.ts',
  'miniprogram/pages/delete-practice/index.ts',
  'miniprogram/pages/deletion-history/index.ts',
  'miniprogram/components/app-tab-bar/index.ts',
  'miniprogram/domain/failure-guidance.ts',
  'miniprogram/services/task-media-store.ts',
  'cloudfunctions/assessmentBff/index.js',
  'cloudfunctions/assessmentBff/core/bff-core.js',
  'cloudfunctions/assessmentBff/core/remote-gateway.js',
  'cloudfunctions/assessmentBff/core/growth-engine.js',
  'cloudfunctions/assessmentBff/core/quota-guard.js',
  'assessment-service/src/server.mjs',
  'assessment-service/src/orchestrator.mjs',
  'assessment-service/src/telemetry.mjs',
  'assessment-service/src/providers/tencent-cloud-ocr-provider.mjs',
  'assessment-service/src/providers/page-first-ocr-evidence-provider.mjs',
  'assessment-service/src/providers/hunyuan-vision-correction-provider.mjs',
  'assessment-service/src/providers/rule-template-correction-provider.mjs',
  'assessment-service/src/providers/request-json.mjs',
  'assessment-service/src/image/png-rgba.mjs',
  'assessment-service/src/image/image-rgba.mjs',
  'assessment-service/src/image/private-http-media-loader.mjs',
  'assessment-service/src/image/cell-image.mjs',
  'assessment-service/src/image/pixel-glyph-feature-provider.mjs',
  'assessment-service/src/image/quality-analyzer.mjs',
  'assessment-service/src/image/grid-segmenter.mjs',
  'assessment-service/src/pipeline/assessment-pipeline-provider.mjs',
  'assessment-service/src/pipeline/approved-synthetic-pipeline.mjs',
  'assessment-service/src/pipeline/character-decision-engine.mjs',
  'assessment-service/src/pipeline/synthetic-fixture-ocr-provider.mjs',
  'assessment-service/test/telemetry.test.mjs',
  'assessment-service/test/provider-adapters.test.mjs',
  'assessment-service/test/assessment-pipeline.test.mjs',
  'assessment-service/test/image-rgba.test.mjs',
  'assessment-service/test/private-http-media-loader.test.mjs',
  'assessment-service/test/cell-image.test.mjs',
  'assessment-service/test/page-first-ocr-evidence-provider.test.mjs',
  'assessment-service/test/pixel-glyph-feature-provider.test.mjs',
  'packages/contracts/generated/assessment-result.schema.json',
  'packages/contracts/generated/fixtures/assessment-result-v2.contract.json',
  'tests/miniprogram-flow.test.mjs'
]
for (const path of required) assert.ok(existsSync(resolve(root, path)), `missing implementation file: ${path}`)

const manifest = read('harness/manifest.yaml')
assert.match(manifest, /id: "implementation-validation"/)
assert.match(manifest, /development_scaffold:\n    status: "verified"/)
assert.match(manifest, /vertical_slice_a:\n    status: "verified"/)
assert.match(manifest, /learning_loop_foundation:\n    status: "verified-local-synthetic"/)
assert.match(manifest, /mobile_main_flow_foundation:\n    status: "verified-local-synthetic"/)
assert.match(manifest, /feedback_reassessment_foundation:\n    status: "verified-local-synthetic"/)
assert.match(manifest, /privacy_actions_foundation:\n    status: "verified-local-synthetic"/)
assert.match(manifest, /observability_security_cost_foundation:\n    status: "verified-local-synthetic"/)
assert.match(manifest, /provider_adapter_foundation:\n    status: "verified-local-mocked"/)
assert.match(manifest, /responsive_client_foundation:\n    status: "verified-static"/)
assert.match(manifest, /synthetic_assessment_pipeline:\n    status: "verified-local-pixel-synthetic"/)
assert.match(manifest, /local_visual_evidence_foundation:\n    status: "verified-static-local-sandbox"/)
assert.match(manifest, /mobile_image_ingestion_foundation:\n    status: "verified-local-synthetic-jpeg-png"/)
assert.match(manifest, /private_media_handoff_foundation:\n    status: "verified-local-mocked"/)
assert.match(manifest, /cell_visual_evidence_foundation:\n    status: "verified-local-pixel-synthetic"/)
assert.match(manifest, /page_first_ocr_evidence_foundation:\n    status: "verified-local-mocked"/)
assert.match(manifest, /pixel_glyph_feature_foundation:\n    status: "verified-local-synthetic-glyph"/)
assert.match(manifest, /prototype_review:\n    status: "approved"/)

const rootPackage = json('package.json')
assert.equal(rootPackage.devDependencies.typescript, '7.0.2')
assert.equal(rootPackage.dependencies['jpeg-js'], '0.4.4')
const assessmentPackage = json('assessment-service/package.json')
assert.equal(assessmentPackage.dependencies['jpeg-js'], '0.4.4')
const cloudPackage = json('cloudfunctions/assessmentBff/package.json')
assert.equal(cloudPackage.dependencies['wx-server-sdk'], '4.0.2')
const project = json('project.config.json')
assert.equal(project.miniprogramRoot, 'miniprogram/')
assert.equal(project.cloudfunctionRoot, 'cloudfunctions/')
assert.deepEqual(project.setting.useCompilerPlugins, ['typescript'])

const clientSource = [
  'miniprogram/app.ts',
  'miniprogram/services/assessment-client.ts',
  'miniprogram/pages/practice/index.ts'
].map(read).join('\n')
for (const forbidden of ['OPENID', 'ocrApiSecret', 'modelApiKey', 'BFF_HMAC_SECRET']) {
  assert.equal(clientSource.includes(forbidden), false, `client contains forbidden secret/identity token: ${forbidden}`)
}
for (const forbidden of ['教师复核', '周报', '月报', '季度报', '年报', '排行榜', '积分挑战']) {
  assert.equal(clientSource.includes(forbidden), false, `client reintroduced excluded feature: ${forbidden}`)
}

const cloudEntry = read('cloudfunctions/assessmentBff/index.js')
assert.match(cloudEntry, /cloud\.getWXContext\(\)/)
assert.match(cloudEntry, /FIXTURE_GATEWAY_FORBIDDEN_IN_PRODUCTION/)
assert.match(cloudEntry, /PRODUCTION_CONSENT_VERSION_NOT_APPROVED/)
assert.match(cloudEntry, /PRODUCTION_SHARE_CONSENT_VERSION_NOT_APPROVED/)
assert.match(cloudEntry, /PRODUCTION_DELETION_CONFIRMATION_NOT_APPROVED/)
assert.match(cloudEntry, /SHARE_TOKEN_SECRET_REQUIRED/)
assert.match(cloudEntry, /PRODUCTION_QUOTA_POLICY_NOT_APPROVED/)
assert.match(cloudEntry, /PRODUCTION_DISTRIBUTED_QUOTA_REQUIRED/)
assert.match(cloudEntry, /enforceConsent: true/)
assert.match(cloudEntry, /cloud\.getTempFileURL/)
assert.doesNotMatch(cloudEntry, /event\.openid|event\.OPENID/)

const assessmentServer = read('assessment-service/src/server.mjs')
assert.match(assessmentServer, /Only approved synthetic providers are enabled; POC gate blocks real providers/)
assert.match(assessmentServer, /SYNTHETIC_PROVIDER_FORBIDDEN_IN_PRODUCTION/)
assert.match(assessmentServer, /x-signature/)
assert.match(assessmentServer, /\/internal\/metrics/)
assert.match(assessmentServer, /TELEMETRY_HASH_SECRET_REQUIRED/)
const assessmentOrchestrator = read('assessment-service/src/orchestrator.mjs')
assert.match(assessmentOrchestrator, /#mediaAccessByTask/)
assert.match(assessmentOrchestrator, /persistableInput/)
assert.doesNotMatch(assessmentOrchestrator.match(/const persistableInput = \{[\s\S]*?\n    \}/)?.[0] ?? '', /cloudFileId|privateUploadPath|consentVersion/)

const privateMediaLoader = read('assessment-service/src/image/private-http-media-loader.mjs')
assert.match(privateMediaLoader, /MEDIA_HOST_ALLOWLIST_REQUIRED/)
assert.match(privateMediaLoader, /redirect: 'error'/)
assert.match(privateMediaLoader, /MEDIA_DIGEST_MISMATCH/)
assert.match(privateMediaLoader, /IMAGE_FILE_TOO_LARGE/)
const bffEntryAndCore = read('cloudfunctions/assessmentBff/index.js')
  + read('cloudfunctions/assessmentBff/core/bff-core.js')
assert.match(bffEntryAndCore, /resolvePrivateMediaAccess/)
assert.match(bffEntryAndCore, /mediaAccessResolver/)
assert.match(bffEntryAndCore, /10 \* 60 \* 1000/)

const ocrProvider = read('assessment-service/src/providers/tencent-cloud-ocr-provider.mjs')
assert.match(ocrProvider, /GeneralHandwritingOCR/)
assert.match(ocrProvider, /2018-11-19/)
assert.match(ocrProvider, /POC_PROVIDER_DISABLED/)
const pageFirstOcr = read('assessment-service/src/providers/page-first-ocr-evidence-provider.mjs')
assert.match(pageFirstOcr, /recognizePageWithCells/)
assert.match(pageFirstOcr, /highConfidenceThreshold = 0\.9/)
assert.match(pageFirstOcr, /first\.candidate\.text !== expectedCharacters\[index\]/)
assert.match(pageFirstOcr, /OCR_CELL_ID_MISMATCH/)
assert.match(pageFirstOcr, /deterministicFeatures/)
assert.match(read('assessment-service/src/pipeline/character-decision-engine.mjs'), /passes\.length < 2/)
const pixelGlyphFeatureProvider = read('assessment-service/src/image/pixel-glyph-feature-provider.mjs')
assert.match(pixelGlyphFeatureProvider, /GLYPH_PROVIDER_REQUIRED/)
assert.match(pixelGlyphFeatureProvider, /skeletonF1/)
assert.match(pixelGlyphFeatureProvider, /quadrantDistribution/)
assert.match(pixelGlyphFeatureProvider, /projectionSimilarity/)
assert.match(pixelGlyphFeatureProvider, /featureVersion/)
assert.match(pixelGlyphFeatureProvider, /glyphVersion/)
assert.doesNotMatch(pixelGlyphFeatureProvider, /font-family|\.ttf|\.otf/)
const modelProvider = read('assessment-service/src/providers/hunyuan-vision-correction-provider.mjs')
assert.match(modelProvider, /api\.hunyuan\.cloud\.tencent\.com\/v1\/chat\/completions/)
assert.match(modelProvider, /MODEL_OUTPUT_INVALID/)

const responsiveSource = [
  read('miniprogram/app.wxss'),
  read('miniprogram/components/app-tab-bar/index.wxss'),
  read('miniprogram/pages/results/index.wxml'),
  read('miniprogram/pages/results/index.wxss')
].join('\n')
assert.match(responsiveSource, /min-width: 600px/)
assert.match(responsiveSource, /min-width: 840px/)
assert.match(responsiveSource, /master-panel/)
assert.match(responsiveSource, /comparison-panel/)
assert.match(responsiveSource, /insight-panel/)

const localVisualEvidence = [
  read('miniprogram/app.ts'),
  read('miniprogram/services/task-media-store.ts'),
  read('miniprogram/pages/upload-confirm/index.ts'),
  read('miniprogram/pages/results/index.ts'),
  read('miniprogram/pages/results/index.wxml'),
  read('miniprogram/pages/delete-practice/index.ts')
].join('\n')
assert.match(localVisualEvidence, /TaskMediaStore/)
assert.match(localVisualEvidence, /selected\?\.polygon/)
assert.match(localVisualEvidence, /crop-image/)
assert.match(localVisualEvidence, /pruneExpired/)
assert.doesNotMatch(read('miniprogram/pages/results/index.wxml'), /cloudFileId|getTempFileURL/)

const pixelPipeline = [
  read('assessment-service/src/image/image-rgba.mjs'),
  read('assessment-service/src/image/cell-image.mjs'),
  read('assessment-service/src/image/quality-analyzer.mjs'),
  read('assessment-service/src/image/grid-segmenter.mjs'),
  read('assessment-service/src/pipeline/assessment-pipeline-provider.mjs')
].join('\n')
assert.match(pixelPipeline, /laplacianVariance/)
assert.match(pixelPipeline, /detectImageFormat/)
assert.match(pixelPipeline, /maxResolutionInMP/)
assert.match(pixelPipeline, /readExifOrientation/)
assert.match(pixelPipeline, /createCellVisualEvidence/)
assert.match(pixelPipeline, /MAXIMUM_CELL_PNG_BYTES/)
assert.match(pixelPipeline, /chunk\(visualCells, 32\)/)
assert.match(pixelPipeline, /chunk\(adviceTargets, 8\)/)
assert.match(pixelPipeline, /cropImageDataUrl/)
assert.match(pixelPipeline, /GLYPH_PROVIDER_REQUIRED/)
assert.doesNotMatch(read('assessment-service/src/pipeline/assessment-pipeline-provider.mjs').match(/const result = \{[\s\S]*?\n    \}/)?.[0] ?? '', /imageBase64|cropImageDataUrl|glyphImageDataUrl/)
assert.match(pixelPipeline, /GRID_INCOMPLETE/)
assert.match(pixelPipeline, /generating_advice/)

console.log('implementation scaffold and synthetic vertical slice are consistent')
