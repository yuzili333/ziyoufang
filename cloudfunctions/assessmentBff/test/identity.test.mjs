import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { deriveSubjectId, deriveWechatSubjectKey } = require('../core/identity')

test('subject account keys are deterministic, domain-separated, and never contain the raw WeChat identifier', () => {
  const subjectId = deriveSubjectId('openid-sensitive-value', 'test-secret')
  const wechatSubjectKey = deriveWechatSubjectKey('openid-sensitive-value', 'test-secret')
  assert.match(subjectId, /^sub_[a-f0-9]{32}$/)
  assert.match(wechatSubjectKey, /^wsk_[a-f0-9]{32}$/)
  assert.notEqual(subjectId, wechatSubjectKey)
  assert.equal(`${subjectId}${wechatSubjectKey}`.includes('openid-sensitive-value'), false)
})
