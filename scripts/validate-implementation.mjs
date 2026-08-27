import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const json = (path) => JSON.parse(read(path))

const required = [
  'project.config.json',
  'miniprogram/config/api-runtime.ts',
  'miniprogram/services/http-client.ts',
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
  'cloudfunctions/assessmentBff/core/cloud-repository.js',
  'cloudfunctions/assessmentBff/core/cloud-quota-guard.js',
  'cloudfunctions/assessmentBff/core/identity.js',
  'cloudfunctions/assessmentBff/core/remote-gateway.js',
  'cloudfunctions/assessmentBff/core/private-media-access.js',
  'cloudfunctions/assessmentBff/core/growth-engine.js',
  'cloudfunctions/assessmentBff/core/quota-guard.js',
  'cloudfunctions/assessmentBff/core/secret-policy.js',
  'assessment-service/src/server.mjs',
  'assessment-service/src/orchestrator.mjs',
  'assessment-service/src/telemetry.mjs',
  'assessment-service/src/providers/tencent-cloud-ocr-provider.mjs',
  'assessment-service/src/providers/approved-fixture-glyph-provider.mjs',
  'assessment-service/src/providers/source-han-serif-glyph-provider.mjs',
  'assessment-service/src/providers/page-first-ocr-evidence-provider.mjs',
  'assessment-service/src/providers/synthetic-page-ocr-provider.mjs',
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
  'assessment-service/test/approved-synthetic-pipeline.test.mjs',
  'assessment-service/test/source-han-serif-glyph-provider.test.mjs',
  'assessment-service/test/character-decision-engine.test.mjs',
  'cloudfunctions/assessmentBff/test/cloud-repository.test.mjs',
  'cloudfunctions/assessmentBff/test/identity.test.mjs',
  'cloudfunctions/assessmentBff/test/cloud-quota-guard.test.mjs',
  'cloudfunctions/assessmentBff/test/private-media-access.test.mjs',
  'cloudfunctions/assessmentBff/test/secret-policy.test.mjs',
  'cloudfunctions/databaseMaintenance/index.js',
  'cloudfunctions/databaseMaintenance/core/expiration-cleanup.js',
  'cloudfunctions/databaseMaintenance/test/expiration-cleanup.test.mjs',
  'ecs-service/src/api.js',
  'ecs-service/src/worker.js',
  'ecs-service/src/mysql-repository.js',
  'ecs-service/src/job-queue.js',
  'ecs-service/src/oss-media.js',
  'ecs-service/migrations/001_initial.sql',
  'deployment/aliyun/compose.yaml',
  'deployment/aliyun/compose.host-nginx.yaml',
  'deployment/aliyun/host-nginx-api-limits.conf',
  'deployment/aliyun/host-nginx-api-locations.conf',
  'deployment/aliyun/host-nginx-validation.conf',
  'assessment-service/container.config.json',
  'packages/contracts/generated/assessment-result.schema.json',
  'packages/contracts/generated/fixtures/assessment-result-v2.contract.json',
  'tests/miniprogram-flow.test.mjs',
  'scripts/scan-sensitive-artifacts.mjs',
  'tests/sensitive-artifact-scan.test.mjs'
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
assert.match(manifest, /aliyun_ecs_production_environment:\n    status: "blocked-external-console"/)
assert.match(manifest, /provider_adapter_foundation:\n    status: "verified-local-mocked"/)
assert.match(manifest, /responsive_client_foundation:\n    status: "verified-static"/)
assert.match(manifest, /synthetic_assessment_pipeline:\n    status: "verified-local-pixel-synthetic"/)
assert.match(manifest, /local_visual_evidence_foundation:\n    status: "verified-static-local-sandbox"/)
assert.match(manifest, /mobile_image_ingestion_foundation:\n    status: "verified-local-synthetic-jpeg-png"/)
assert.match(manifest, /private_media_handoff_foundation:\n    status: "verified-local-mocked"/)
assert.match(manifest, /cell_visual_evidence_foundation:\n    status: "verified-local-pixel-synthetic"/)
assert.match(manifest, /page_first_ocr_evidence_foundation:\n    status: "verified-local-mocked"/)
assert.match(manifest, /pixel_glyph_feature_foundation:\n    status: "verified-local-synthetic-glyph"/)
assert.match(manifest, /synthetic_page_ocr_pixel_glyph_pipeline:\n    status: "verified-local-synthetic-glyph"/)
assert.match(manifest, /licensed_glyph_ecs_foundation:\n    status: "verified-local-licensed-glyph"/)
assert.match(manifest, /legacy_client_removal:\n    status: "removed"/)
assert.match(manifest, /prototype_review:\n    status: "approved"/)

const rootPackage = json('package.json')
assert.equal(rootPackage.devDependencies.typescript, '7.0.2')
assert.equal(rootPackage.dependencies['jpeg-js'], '0.4.4')
const assessmentPackage = json('assessment-service/package.json')
assert.equal(assessmentPackage.dependencies['jpeg-js'], '0.4.4')
assert.equal(assessmentPackage.dependencies.express, '5.2.1')
assert.equal(assessmentPackage.dependencies['@napi-rs/canvas'], '1.0.2')
assert.equal(assessmentPackage.optionalDependencies['@napi-rs/canvas-linux-arm64-gnu'], '1.0.2')
assert.equal(assessmentPackage.optionalDependencies['@napi-rs/canvas-linux-x64-gnu'], '1.0.2')
const cloudPackage = json('cloudfunctions/assessmentBff/package.json')
assert.equal(cloudPackage.dependencies['wx-server-sdk'], '4.0.2')
const project = json('project.config.json')
assert.equal(project.appid, 'wxc7e8d08156f44970')
assert.equal(project.miniprogramRoot, 'miniprogram/')
assert.equal(project.cloudfunctionRoot, undefined)
assert.deepEqual(project.setting.useCompilerPlugins, ['typescript'])
assert.equal(existsSync(resolve(root, 'client')), false, 'legacy ArkUI-X client must not return after migration')

const clientSource = [
  'miniprogram/app.ts',
  'miniprogram/services/assessment-client.ts',
  'miniprogram/pages/practice/index.ts'
].map(read).join('\n')
assert.doesNotMatch(clientSource, /wx\.cloud/)
assert.match(clientSource, /\/api\/v1\/auth\/wechat|HttpClient/)
for (const forbidden of ['OPENID', 'ocrApiSecret', 'modelApiKey', 'BFF_HMAC_SECRET']) {
  assert.equal(clientSource.includes(forbidden), false, `client contains forbidden secret/identity token: ${forbidden}`)
}
for (const forbidden of ['教师复核', '周报', '月报', '季度报', '年报', '排行榜', '积分挑战']) {
  assert.equal(clientSource.includes(forbidden), false, `client reintroduced excluded feature: ${forbidden}`)
}

const cloudEntry = read('cloudfunctions/assessmentBff/index.js')
assert.match(cloudEntry, /cloud\.getWXContext\(\)/)
assert.match(cloudEntry, /upsertSubjectAccount/)
assert.match(cloudEntry, /deriveWechatSubjectKey/)
assert.match(cloudEntry, /FIXTURE_GATEWAY_FORBIDDEN_IN_PRODUCTION/)
assert.match(cloudEntry, /PRODUCTION_CONSENT_VERSION_NOT_APPROVED/)
assert.match(cloudEntry, /PRODUCTION_SHARE_CONSENT_VERSION_NOT_APPROVED/)
assert.match(cloudEntry, /PRODUCTION_DELETION_CONFIRMATION_NOT_APPROVED/)
assert.match(cloudEntry, /SHARE_TOKEN_SECRET_REQUIRED/)
assert.match(cloudEntry, /PRODUCTION_QUOTA_POLICY_NOT_APPROVED/)
assert.match(cloudEntry, /PRODUCTION_DISTRIBUTED_QUOTA_REQUIRED/)
assert.match(cloudEntry, /assertProductionSecrets/)
assert.match(cloudEntry, /CloudSlidingWindowQuota/)
assert.match(cloudEntry, /QUOTA_BACKEND === 'distributed'/)
assert.match(cloudEntry, /enforceConsent: true/)
assert.match(cloudEntry, /cloud\.getTempFileURL/)
assert.match(read('cloudfunctions/assessmentBff/core/private-media-access.js'), /PRIVATE_MEDIA_EXPIRED/)
assert.doesNotMatch(cloudEntry, /event\.openid|event\.OPENID/)

const assessmentServer = read('assessment-service/src/server.mjs')
assert.match(assessmentServer, /Only approved synthetic providers are enabled; POC gate blocks real providers/)
assert.match(assessmentServer, /SYNTHETIC_PROVIDER_FORBIDDEN_IN_PRODUCTION/)
assert.match(assessmentServer, /x-signature/)
assert.match(assessmentServer, /\/internal\/metrics/)
assert.match(assessmentServer, /TELEMETRY_HASH_SECRET_REQUIRED/)
assert.match(assessmentServer, /PRODUCTION_SECRETS_MUST_BE_DISTINCT/)
assert.match(assessmentServer, /app\.get\('\/health'/)
assert.match(assessmentServer, /ASSESSMENT_PROVIDER_NOT_ENABLED/)
assert.match(assessmentServer, /\/internal\/v1\/assessments:run/)
assert.doesNotMatch(assessmentServer, /queueMicrotask/)
assert.match(assessmentServer, /server\.listen\(port, '0\.0\.0\.0'/)
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
  + read('cloudfunctions/assessmentBff/core/private-media-access.js')
assert.match(bffEntryAndCore, /resolvePrivateMediaAccess/)
assert.match(bffEntryAndCore, /mediaAccessResolver/)
assert.match(bffEntryAndCore, /10 \* 60 \* 1000/)
assert.match(bffEntryAndCore, /upsertMediaObject/)
assert.match(bffEntryAndCore, /sourceMediaId/)
assert.match(bffEntryAndCore, /30 \* 24 \* 60 \* 60 \* 1000/)
assert.match(bffEntryAndCore, /const publicTask/)
assert.match(bffEntryAndCore, /cloudFileId, sourceMediaId, imageSha256/)
const cloudRepository = read('cloudfunctions/assessmentBff/core/cloud-repository.js')
assert.match(cloudRepository, /collection\('media_objects'\)/)
assert.match(cloudRepository, /sourceTaskId/)
assert.match(cloudRepository, /getMediaObject/)
assert.match(cloudRepository, /collection\('subject_accounts'\)/)
assert.match(cloudRepository, /createdAt: existing\?\.createdAt/)
assert.match(cloudRepository, /transaction\.collection\('assessment_tasks'\)/)
assert.match(cloudRepository, /idempotencyKey: task\.idempotencyKey/)
const distributedQuota = read('cloudfunctions/assessmentBff/core/cloud-quota-guard.js')
assert.match(distributedQuota, /runTransaction/)
assert.match(distributedQuota, /collection\('quota_events'\)/)
assert.match(distributedQuota, /idempotencyKey/)
const expirationCleanup = read('cloudfunctions/databaseMaintenance/core/expiration-cleanup.js')
assert.match(expirationCleanup, /share_expired/)
assert.match(expirationCleanup, /storage_deleted/)
assert.match(expirationCleanup, /batchLimit > 100/)
assert.doesNotMatch(expirationCleanup, /console\.log/)
const deployment = json('harness/contracts/aliyun-ecs-production-deployment.json')
assert.equal(deployment.ecs.provider, 'alibaba-cloud-ecs')
assert.equal(deployment.database.type, 'mysql-8-inno-db')
assert.equal(deployment.objectStorage.credentials, 'ecs-ram-role')
assert.equal(deployment.pipeline.productionTraffic, 'protected-environment-manual-approval')
const ecsApi = read('ecs-service/src/api.js')
assert.match(ecsApi, /\/api\/v1\/auth\/wechat/)
assert.match(ecsApi, /SESSION_INVALID_OR_EXPIRED/)
assert.match(read('ecs-service/src/job-queue.js'), /FOR UPDATE SKIP LOCKED/)
assert.match(read('ecs-service/src/oss-media.js'), /content-length-range/)
assert.match(read('deployment/aliyun/compose.yaml'), /worker:/)

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
assert.match(read('assessment-service/src/pipeline/character-decision-engine.mjs'), /differenceAnnotations/)
assert.match(read('assessment-service/src/pipeline/character-decision-engine.mjs'), /usedAnchors/)
const pixelGlyphFeatureProvider = read('assessment-service/src/image/pixel-glyph-feature-provider.mjs')
assert.match(pixelGlyphFeatureProvider, /GLYPH_PROVIDER_REQUIRED/)
assert.match(pixelGlyphFeatureProvider, /skeletonF1/)
assert.match(pixelGlyphFeatureProvider, /quadrantDistribution/)
assert.match(pixelGlyphFeatureProvider, /projectionSimilarity/)
assert.match(pixelGlyphFeatureProvider, /featureVersion/)
assert.match(pixelGlyphFeatureProvider, /glyphVersion/)
assert.doesNotMatch(pixelGlyphFeatureProvider, /font-family|\.ttf|\.otf/)
const approvedSyntheticPipeline = read('assessment-service/src/pipeline/approved-synthetic-pipeline.mjs')
assert.match(approvedSyntheticPipeline, /PageFirstOcrEvidenceProvider/)
assert.match(approvedSyntheticPipeline, /PixelGlyphFeatureProvider/)
assert.match(approvedSyntheticPipeline, /ApprovedFixtureGlyphProvider/)
assert.doesNotMatch(approvedSyntheticPipeline, /SyntheticFixtureOcrProvider/)
const fixtureGlyphProvider = read('assessment-service/src/providers/approved-fixture-glyph-provider.mjs')
assert.match(fixtureGlyphProvider, /GLYPH_REFERENCE_HASH_MISMATCH/)
assert.match(fixtureGlyphProvider, /Non-shipping synthetic regression only/)
const licensedGlyphProvider = read('assessment-service/src/providers/source-han-serif-glyph-provider.mjs')
assert.match(licensedGlyphProvider, /78aa7a328fd974df2d688c8a9fd74a33d8334dfa84ab24d9d11efb2ffc464117/)
assert.match(licensedGlyphProvider, /GLYPH_FONT_HASH_MISMATCH/)
assert.match(licensedGlyphProvider, /GLYPH_LICENSE_HASH_MISMATCH/)
assert.match(licensedGlyphProvider, /source-han-serif-sc-regular@/)
const fontAsset = json('assessment-service/assets/fonts/source-han-serif-sc-2.003R/font-asset.json')
assert.equal(fontAsset.license, 'OFL-1.1')
assert.equal(fontAsset.modified, false)
assert.equal(fontAsset.artifactSha256, '78aa7a328fd974df2d688c8a9fd74a33d8334dfa84ab24d9d11efb2ffc464117')
assert.ok(existsSync(resolve(root, 'assessment-service/assets/fonts/source-han-serif-sc-2.003R/LICENSE.txt')))
assert.ok(existsSync(resolve(root, 'assessment-service/assets/fonts/source-han-serif-sc-2.003R/SourceHanSerifSC-Regular.otf')))
const clientFiles = readdirSync(resolve(root, 'miniprogram'), { recursive: true })
assert.equal(clientFiles.some((path) => /\.(otf|ttf|woff2?)$/i.test(String(path))), false, 'font binary must not enter miniprogram')
const dockerfile = read('assessment-service/Dockerfile')
assert.match(dockerfile, /FROM node:20-bookworm-slim/)
assert.match(dockerfile, /AS verified/)
assert.match(dockerfile, /RUN npm run test:container/)
assert.match(dockerfile, /ASSESSMENT_PROVIDER_MODE=font-smoke/)
assert.match(dockerfile, /EXPOSE 8080/)
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
assert.match(localVisualEvidence, /differenceAnnotations/)
assert.doesNotMatch(read('miniprogram/pages/results/index.wxml'), /cloudFileId|getTempFileURL/)

const networkRecovery = read('miniprogram/services/network-service.ts')
  + read('miniprogram/pages/practice/index.ts')
assert.match(networkRecovery, /observeNetworkRecovery/)
assert.match(networkRecovery, /onNetworkStatusChange/)
assert.match(networkRecovery, /offNetworkStatusChange/)
assert.match(networkRecovery, /void this\.resumePending\(\)/)
const localRetention = read('miniprogram/services/local-task-store.ts')
  + read('miniprogram/services/task-media-store.ts')
  + read('miniprogram/app.ts')
assert.match(localRetention, /LocalTaskStore\.activePaths\(now\)/)
assert.match(localRetention, /TaskMediaStore\.activePaths\(now\)/)
assert.match(localRetention, /pruneExpired\(now, taskActivePaths\)/)
assert.match(localRetention, /pruneExpired\(now, localActivePaths\)/)
assert.match(localRetention, /RETENTION_MS = 30 \* 24 \* 60 \* 60 \* 1000/)

const uploadCancellation = read('miniprogram/pages/upload-confirm/index.ts')
  + read('miniprogram/pages/upload-confirm/index.wxml')
assert.match(uploadCancellation, /AssessmentClient\.cancelAssessment/)
assert.match(uploadCancellation, /cancelServerTaskIfNeeded/)
assert.match(uploadCancellation, /rotateCancelledDraft/)
assert.match(uploadCancellation, /createLocalId\('idem'\)/)
assert.match(uploadCancellation, /busy && uploadingFile/)

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
