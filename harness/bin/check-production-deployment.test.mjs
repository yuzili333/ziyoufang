import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { inspectProductionDeployment } from './check-production-deployment.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const readJson = (path) => JSON.parse(read(path))
const base = {
  deployment: readJson('harness/contracts/aliyun-ecs-production-deployment.json'),
  project: readJson('project.config.json'),
  apiRuntimeSource: read('miniprogram/config/api-runtime.ts'),
  composeSource: read('deployment/aliyun/compose.yaml'),
  composeOverrideSource: read('deployment/aliyun/compose.host-nginx.yaml'),
  hostNginxSource: read('deployment/aliyun/host-nginx-api-locations.conf'),
  migrationSource: read('ecs-service/migrations/001_initial.sql'),
  miniprogramSource: ['app.ts', 'services/assessment-client.ts', 'services/media-service.ts']
    .map((path) => read(`miniprogram/${path}`)).join('\n')
}

test('current ECS deployment contract binds the API and OSS domains while retaining external infrastructure blockers', () => {
  const result = inspectProductionDeployment(base)
  assert.deepEqual(result.errors, [])
  assert.equal(result.blockers.includes('publicApiBaseUrl is not registered'), false)
  assert.equal(result.blockers.includes('OSS region is not registered'), false)
  assert.equal(result.blockers.includes('private OSS bucket is not registered'), false)
  assert.equal(result.blockers.includes('private MySQL address is not registered'), false)
  assert.equal(result.blockers.includes('MySQL database name is not registered'), false)
  assert.ok(result.blockers.includes('MySQL restore drill evidence is not registered'))
})

test('a complete ECS deployment requires matching HTTPS API, private data resources and named owners', () => {
  const deployment = structuredClone(base.deployment)
  Object.assign(deployment.database, { address: 'mysql.vpc.internal', databaseName: 'ziyoufang' })
  deployment.database.backup.restoreDrillAt = '2026-08-12T10:00:00.000Z'
  deployment.ecs.sshSource = '203.0.113.10/32'
  Object.assign(deployment.secretOwnership, {
    primaryIdentity: 'platform-owner@example.com', backupIdentity: 'backend-owner@example.com',
    disclosedWechatCloudCliSecretRevokedAt: '2026-08-12T10:00:00.000Z'
  })
  const result = inspectProductionDeployment({
    ...base, deployment
  })
  assert.deepEqual(result, { errors: [], blockers: [] })
})

test('host Nginx coexistence rejects a public API container or missing API routes', () => {
  const result = inspectProductionDeployment({
    ...base, composeOverrideSource: 'ports: ["18080:8080"]', hostNginxSource: 'location /api/v1/'
  })
  assert.ok(result.errors.includes(
    'host Nginx mode must disable the container edge by default and bind API only to loopback'
  ))
  assert.ok(result.errors.includes('host Nginx route is missing /api/v1/health'))
})

test('CloudBase client calls and incomplete MySQL migrations fail the structural gate', () => {
  const result = inspectProductionDeployment({
    ...base, miniprogramSource: 'wx.cloud.callFunction({})', migrationSource: ''
  })
  assert.ok(result.errors.includes('miniprogram must not call CloudBase runtime APIs'))
  assert.ok(result.errors.includes('MySQL migration misses assessment_jobs'))
})
