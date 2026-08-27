#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..', '..')
const EXPECTED_APP_ID = 'wxc7e8d08156f44970'
const PLACEHOLDER_API = '__PROD_API_BASE_URL_REQUIRED__'

const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const sourceApiBaseUrl = (source) => source.match(/PRODUCTION_API_BASE_URL(?::\s*string)?\s*=\s*'([^']+)'/)?.[1] ?? null

export function inspectProductionDeployment({
  deployment, project, apiRuntimeSource, composeSource, composeOverrideSource = '',
  hostNginxSource = '', migrationSource, miniprogramSource
}) {
  const errors = []
  const blockers = []
  if (deployment.appId !== EXPECTED_APP_ID || project.appid !== EXPECTED_APP_ID) {
    errors.push('confirmed AppID must match project and deployment contracts')
  }
  if (deployment.status !== 'accepted' || deployment.ecs?.provider !== 'alibaba-cloud-ecs'
    || deployment.ecs?.minimumCpu < 2 || deployment.ecs?.minimumMemoryGiB < 4
    || deployment.ecs?.availability !== 'single-node-recoverable') {
    errors.push('deployment must use the accepted recoverable Alibaba Cloud ECS baseline')
  }
  if (deployment.database?.type !== 'mysql-8-inno-db'
    || deployment.database?.tlsMode !== 'VERIFY_IDENTITY'
    || deployment.database?.directClientAccess !== 'denied') {
    errors.push('database must be private MySQL 8/InnoDB with verified TLS and no client access')
  }
  if (deployment.database?.addressType === 'docker-dns-alias'
    && (deployment.database?.network !== 'docker-private-network'
      || !deployment.database?.dockerNetwork
      || !composeSource.includes(`name: ${deployment.database.dockerNetwork}`))) {
    errors.push('Docker MySQL alias must be backed by the registered private Compose network')
  }
  if (deployment.objectStorage?.provider !== 'aliyun-oss-private'
    || deployment.objectStorage?.credentials !== 'ecs-ram-role') {
    errors.push('media must use private OSS with ECS RAM role credentials')
  }
  if (deployment.pipeline?.provider !== 'github-actions' || deployment.pipeline?.branch !== 'main'
    || deployment.pipeline?.trigger !== 'push'
    || deployment.pipeline?.productionTraffic !== 'protected-environment-manual-approval') {
    errors.push('pipeline must verify main pushes and require protected production approval')
  }
  for (const service of ['mysql:', 'api:', 'worker:', 'assessment:']) {
    if (!composeSource.includes(service)) errors.push(`compose deployment misses ${service.slice(0, -1)} service`)
  }
  if (deployment.ecs?.edgeMode === 'existing-host-nginx-path-coexistence') {
    if (!composeOverrideSource.includes('127.0.0.1:18080:8080') || !composeOverrideSource.includes('container-edge')) {
      errors.push('host Nginx mode must disable the container edge by default and bind API only to loopback')
    }
    for (const route of ['/api/v1/health', '/api/v1/auth/wechat', '/api/v1/']) {
      if (!hostNginxSource.includes(route)) errors.push(`host Nginx route is missing ${route}`)
    }
    if (hostNginxSource.includes('/internal/')) errors.push('host Nginx must not expose internal assessment routes')
  } else if (!composeSource.includes('80:80') || !composeSource.includes('443:443')) {
    errors.push('container edge must be the only public HTTP/HTTPS entry')
  }
  for (const table of ['auth_sessions', 'assessment_jobs', 'assessment_tasks', 'media_objects', 'share_cards', 'quota_events']) {
    if (!migrationSource.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) errors.push(`MySQL migration misses ${table}`)
  }
  if (/wx\.cloud/.test(miniprogramSource)) errors.push('miniprogram must not call CloudBase runtime APIs')
  const configuredApi = sourceApiBaseUrl(apiRuntimeSource)
  if (!deployment.publicApiBaseUrl) blockers.push('publicApiBaseUrl is not registered')
  if (!configuredApi || configuredApi === PLACEHOLDER_API) {
    blockers.push('miniprogram production API base URL is not bound')
  } else if (configuredApi !== deployment.publicApiBaseUrl) {
    errors.push('miniprogram API base URL does not match the deployment contract')
  }
  if (!deployment.database?.address) blockers.push('private MySQL address is not registered')
  if (!deployment.database?.databaseName) blockers.push('MySQL database name is not registered')
  if (!deployment.database?.backup?.restoreDrillAt) blockers.push('MySQL restore drill evidence is not registered')
  if (!deployment.objectStorage?.region) blockers.push('OSS region is not registered')
  if (!deployment.objectStorage?.bucket) blockers.push('private OSS bucket is not registered')
  if (deployment.objectStorage?.publicUploadHost !== deployment.miniprogramDomains?.uploadFile?.[0]
    || deployment.objectStorage?.publicAccessHost !== deployment.miniprogramDomains?.downloadFile?.[0]) {
    errors.push('OSS public upload/access hosts must match WeChat Mini Program legal domains')
  }
  if (deployment.publicApiBaseUrl !== deployment.miniprogramDomains?.request?.[0]) {
    errors.push('public API base URL must match the WeChat Mini Program request legal domain')
  }
  if (!deployment.ecs?.sshSource) blockers.push('restricted SSH source is not registered')
  if (!deployment.secretOwnership?.primaryIdentity) blockers.push('platform primary secret owner identity is not registered')
  if (!deployment.secretOwnership?.backupIdentity) blockers.push('backend backup secret owner identity is not registered')
  if (!validDate(deployment.secretOwnership?.disclosedWechatCloudCliSecretRevokedAt)) {
    blockers.push('disclosed WeChat Cloud CLI secret revocation evidence is not registered')
  }
  return { errors, blockers }
}

async function main() {
  const read = (path) => readFileSync(resolve(root, path), 'utf8')
  const readJson = (path) => JSON.parse(read(path))
  const miniprogramSource = ['app.ts', 'services/assessment-client.ts', 'services/media-service.ts']
    .map((path) => read(`miniprogram/${path}`)).join('\n')
  const result = inspectProductionDeployment({
    deployment: readJson('harness/contracts/aliyun-ecs-production-deployment.json'),
    project: readJson('project.config.json'),
    apiRuntimeSource: read('miniprogram/config/api-runtime.ts'),
    composeSource: read('deployment/aliyun/compose.yaml'),
    composeOverrideSource: read('deployment/aliyun/compose.host-nginx.yaml'),
    hostNginxSource: read('deployment/aliyun/host-nginx-api-locations.conf'),
    migrationSource: read('ecs-service/migrations/001_initial.sql'),
    miniprogramSource
  })
  for (const error of result.errors) console.error(`configuration error: ${error}`)
  for (const blocker of result.blockers) console.log(`external blocker: ${blocker}`)
  if (result.errors.length || (process.argv.includes('--require-ready') && result.blockers.length)) process.exitCode = 1
  else console.log(result.blockers.length
    ? 'production deployment contract is structurally valid but externally blocked'
    : 'production deployment gate is ready')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
