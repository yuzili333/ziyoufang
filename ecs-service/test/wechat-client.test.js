const assert = require('node:assert/strict')
const test = require('node:test')
const { WechatLoginClient } = require('../src/wechat-client')

test('wechat login exchanges only a short-lived code and does not return session_key', async () => {
  let requested
  const client = new WechatLoginClient({
    appId: 'wx-app', appSecret: 'server-only',
    fetchImpl: async (url) => {
      requested = url
      return { ok: true, json: async () => ({ openid: 'openid-value', session_key: 'must-not-leave-client' }) }
    }
  })
  assert.deepEqual(await client.exchange('login-code'), { openid: 'openid-value', unionid: undefined })
  assert.equal(requested.searchParams.get('secret'), 'server-only')
  assert.equal(JSON.stringify(await client.exchange('login-code')).includes('session_key'), false)
})

test('wechat login rejects upstream errors without exposing provider details', async () => {
  const client = new WechatLoginClient({
    appId: 'wx-app', appSecret: 'secret',
    fetchImpl: async () => ({ ok: true, json: async () => ({ errcode: 40029, errmsg: 'invalid code' }) })
  })
  await assert.rejects(client.exchange('bad-code'), /WECHAT_LOGIN_REJECTED/)
})
