import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')

test('consent is the cold-start page and capture requires an explicit confirmation page', () => {
  const app = JSON.parse(read('miniprogram/app.json'))
  assert.equal(app.pages[0], 'pages/consent/index')
  assert.ok(app.pages.includes('pages/upload-confirm/index'))
  assert.ok(app.pages.includes('pages/progress/index'))
  const practice = read('miniprogram/pages/practice/index.ts')
  assert.match(practice, /CaptureDraftStore\.put/)
  assert.match(practice, /pages\/upload-confirm\/index/)
})

test('upload confirmation preserves offline work and routes online work through private upload', () => {
  const confirm = read('miniprogram/pages/upload-confirm/index.ts')
  assert.match(confirm, /LocalTaskStore\.put/)
  assert.match(confirm, /AssessmentClient\.createUploadTask/)
  assert.match(confirm, /MediaService\.createPrivateUpload/)
  const media = read('miniprogram/services/media-service.ts')
  assert.match(media, /onProgressUpdate/)
  assert.match(media, /abort/)
  assert.match(confirm, /AssessmentClient\.submitAssessment/)
  assert.match(confirm, /pages\/progress\/index/)
})

test('progress screen follows the approved stage vocabulary and exposes retry and cancel', () => {
  const progress = read('miniprogram/pages/progress/index.ts')
  for (const stage of [
    'quality_checking', 'segmenting', 'recognizing', 'comparing', 'generating_advice', 'persisting_result'
  ]) assert.ok(progress.includes(stage), `missing progress stage ${stage}`)
  assert.match(progress, /AssessmentClient\.retryAssessment/)
  assert.match(progress, /AssessmentClient\.cancelAssessment/)
})

test('non-retryable image quality failures route to specific retake guidance', () => {
  const guidance = read('miniprogram/domain/failure-guidance.ts')
  const progress = read('miniprogram/pages/progress/index.ts')
    + read('miniprogram/pages/progress/index.wxml')
  for (const code of [
    'IMAGE_BLUR', 'GRID_INCOMPLETE', 'IMAGE_TOO_DARK', 'IMAGE_OVEREXPOSED',
    'IMAGE_FORMAT_UNSUPPORTED', 'IMAGE_DECODE_FAILED', 'IMAGE_INPUT_EMPTY',
    'IMAGE_FILE_TOO_LARGE', 'IMAGE_PIXEL_LIMIT_EXCEEDED', 'MEDIA_DIGEST_MISMATCH',
    'MEDIA_HOST_FORBIDDEN', 'MEDIA_ACCESS_INVALID'
  ]) {
    assert.ok(guidance.includes(code), `missing retake guidance for ${code}`)
  }
  assert.match(guidance, /action: 'retake'/)
  assert.match(progress, /failureAction === 'retake'/)
  assert.match(progress, /重新拍摄/)
  assert.match(progress, /expectedText/)
})

test('draft consent cannot silently become a production authorization', () => {
  const cloudEntry = read('cloudfunctions/assessmentBff/index.js')
  assert.match(cloudEntry, /PRODUCTION_CONSENT_VERSION_NOT_APPROVED/)
  assert.match(cloudEntry, /enforceConsent: true/)
  const consentPage = read('miniprogram/pages/consent/index.wxml')
  assert.match(consentPage, /当前版本仅供研发验证/)
})

test('previously synchronized consent permits offline local capture but not server upload authority', () => {
  const page = read('miniprogram/pages/consent/index.ts')
  const cache = read('miniprogram/services/consent-cache.ts')
  assert.match(page, /ConsentCache\.isActive/)
  assert.match(cache, /consentVersion === CONSENT_VERSION/)
  const bff = read('cloudfunctions/assessmentBff/core/bff-core.js')
  assert.match(bff, /requireActiveConsent\(subjectId\)/)
})

test('result feedback creates a new progress flow and keeps an accessible version history', () => {
  const resultPage = read('miniprogram/pages/results/index.ts')
  const feedbackPage = read('miniprogram/pages/feedback/index.ts')
  const historyPage = read('miniprogram/pages/feedback-history/index.ts')
    + read('miniprogram/pages/feedback-history/index.wxml')
  assert.match(resultPage, /pages\/feedback\/index/)
  assert.match(feedbackPage, /submitStudentFeedback/)
  assert.match(feedbackPage, /pages\/progress\/index/)
  assert.match(historyPage, /originalTaskId/)
  assert.match(historyPage, /reassessmentTaskId/)
})

test('sharing requires a dedicated guardian confirmation and renders only redacted fields', () => {
  const sharePage = read('miniprogram/pages/share-confirm/index.ts')
    + read('miniprogram/pages/share-confirm/index.wxml')
  const publicPage = read('miniprogram/pages/shared-card/index.ts')
    + read('miniprogram/pages/shared-card/index.wxml')
  assert.match(sharePage, /guardianConfirmed/)
  assert.match(sharePage, /redactionConfirmed/)
  assert.match(sharePage, /createShareCard/)
  assert.match(sharePage, /revokeShareCard/)
  assert.match(publicPage, /getSharedCard/)
  assert.doesNotMatch(publicPage, /savedFilePath|cloudFileId|taskId/)
})

test('practice deletion presents impact confirmation and exposes durable job history', () => {
  const deletion = read('miniprogram/pages/delete-practice/index.ts')
    + read('miniprogram/pages/delete-practice/index.wxml')
  const history = read('miniprogram/pages/deletion-history/index.ts')
  assert.match(deletion, /impactConfirmed/)
  assert.match(deletion, /AssessmentClient\.deletePractice/)
  assert.match(deletion, /字本、成长曲线和重点监测状态/)
  assert.match(history, /getDeletionJobs/)
})

test('formal client implements the approved width-based phone and PAD result layout', () => {
  const contract = JSON.parse(read('harness/contracts/responsive-layout-v2.json'))
  assert.deepEqual(contract.breakpoints.map(({ id, minWidth, maxWidth }) => ({ id, minWidth, maxWidth })), [
    { id: 'compact', minWidth: 0, maxWidth: 599 },
    { id: 'medium', minWidth: 600, maxWidth: 839 },
    { id: 'expanded', minWidth: 840, maxWidth: null }
  ])
  const globalStyles = read('miniprogram/app.wxss')
  const navigation = read('miniprogram/components/app-tab-bar/index.wxml')
    + read('miniprogram/components/app-tab-bar/index.wxss')
  const resultMarkup = read('miniprogram/pages/results/index.wxml')
  const resultStyles = read('miniprogram/pages/results/index.wxss')
  assert.match(globalStyles, /@media \(min-width: 600px\) and \(max-width: 839px\)/)
  assert.match(globalStyles, /@media \(min-width: 840px\)/)
  assert.match(navigation, /rail-brand/)
  assert.match(navigation, /flex-direction: column/)
  assert.match(resultMarkup, /class="master-panel"/)
  assert.match(resultMarkup, /class="pad-rail" scroll-y/)
  assert.match(resultMarkup, /class="comparison-panel"/)
  assert.match(resultMarkup, /class="insight-panel"/)
  assert.match(resultMarkup, /mode === 'overlay'/)
  assert.match(resultMarkup, /class="parallel-glyphs"/)
  for (const label of ['笔画规范', '间架结构', '字形比例', '位置布局', '稳定性']) {
    assert.ok(resultMarkup.includes(label), `expanded insight panel lost dimension ${label}`)
  }
  assert.match(resultStyles, /grid-template-columns: minmax\(190px, 222px\) minmax\(0, 1fr\)/)
  assert.match(resultStyles, /grid-template-columns: minmax\(470px, 1fr\) minmax\(310px, 340px\)/)
  assert.doesNotMatch(resultMarkup + resultStyles, /iPad|HarmonyOS|Android|iPhone/)
})

test('result comparison uses only retained local media and service polygons', () => {
  const resultPage = read('miniprogram/pages/results/index.ts')
    + read('miniprogram/pages/results/index.wxml')
    + read('miniprogram/pages/results/index.wxss')
  const mediaStore = read('miniprogram/services/task-media-store.ts')
  const upload = read('miniprogram/pages/upload-confirm/index.ts')
  const feedback = read('miniprogram/pages/feedback/index.ts')
  const deletion = read('miniprogram/pages/delete-practice/index.ts')
  const app = read('miniprogram/app.ts')
  assert.match(upload, /TaskMediaStore\.bind/)
  assert.match(feedback, /TaskMediaStore\.clone/)
  assert.match(deletion, /TaskMediaStore\.removeFamily/)
  assert.match(app, /TaskMediaStore\.pruneExpired/)
  assert.match(mediaStore, /30 \* 24 \* 60 \* 60 \* 1000/)
  assert.match(mediaStore, /parentTaskId/)
  assert.match(mediaStore, /removeByLocalTaskId/)
  assert.match(resultPage, /TaskMediaStore\.get/)
  assert.match(resultPage, /selected\?\.polygon/)
  assert.match(resultPage, /class="crop-image"/)
  assert.match(resultPage, /class="standard-overlay"/)
  assert.match(resultPage, /mode="widthFix"/)
  assert.doesNotMatch(resultPage, /cloudFileId|getTempFileURL/)
})

test('photo upload preserves the detected JPEG or PNG content type instead of forcing a jpg suffix', () => {
  const media = read('miniprogram/services/media-service.ts')
  const practice = read('miniprogram/pages/practice/index.ts')
  const confirmation = read('miniprogram/pages/upload-confirm/index.ts')
  assert.match(media, /getImageInfo/)
  assert.match(media, /normalizeFormat/)
  assert.match(media, /SupportedImageFormat/)
  assert.match(media, /format === 'png' \? 'png' : 'jpg'/)
  assert.match(practice, /MediaService\.extension\(pending\.mediaFormat\)/)
  assert.match(confirmation, /MediaService\.extension\(draft\.mediaFormat\)/)
  assert.doesNotMatch(practice + confirmation, /privateUploadPath\}\.jpg/)
})
