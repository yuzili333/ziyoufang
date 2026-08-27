import assert from 'node:assert/strict'
import test from 'node:test'

import { inspectSensitiveContent } from '../scripts/scan-sensitive-artifacts.mjs'

test('sensitive artifact scanner rejects CLI credentials without echoing their value', () => {
  const credential = 'AA' + 'Q' + 'A'.repeat(96) + '='
  assert.deepEqual(inspectSensitiveContent(`credential=${credential}`), ['wechat-cli-secret'])
})

test('sensitive artifact scanner allows documented placeholders', () => {
  assert.deepEqual(inspectSensitiveContent([
    'BFF_HMAC_SECRET=replace-with-secret-manager-reference',
    'WECHAT_CLOUD_CLI_SECRET=<protected-pipeline-secret>',
    'MYSQL_PASSWORD='
  ].join('\n')), [])
})

test('sensitive artifact scanner rejects private keys and literal environment secrets', () => {
  const privateKeyHeader = '-----BEGIN ' + 'PRIVATE KEY-----'
  const literalSecret = 'MODEL_API_' + 'KEY=live_literal_value_123456789'
  assert.deepEqual(inspectSensitiveContent(privateKeyHeader), ['private-key'])
  assert.deepEqual(inspectSensitiveContent(literalSecret), ['literal-secret-assignment'])
})
