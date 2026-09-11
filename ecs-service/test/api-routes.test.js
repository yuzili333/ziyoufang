const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const test = require('node:test')
const { createApiApp } = require('../src/api')

function appFixture() {
  return createApiApp({
    config: {
      nodeEnv: 'development',
      versions: {
        consent: 'consent-v1', shareConsent: 'share-v1',
        deletionConfirmation: 'delete-v1', quotaPolicy: 'quota-v1'
      },
      secrets: { subjectId: 'subject-secret', shareToken: 'share-secret', bffHmac: 'bff-secret' }
    },
    repository: { getShareCardByTokenHash: async () => null }, queue: {}, quotaGuard: null,
    sessions: { resolve: async () => null }, wechat: {}, media: {},
    pool: { query: async () => [[{ ready: 1 }]] }
  })
}

test('API exposes equivalent internal and public health routes without exposing internal assessment routes', () => {
  const app = appFixture()
  const routes = app.router.stack.filter((layer) => layer.route).map((layer) => layer.route.path)
  assert.ok(routes.includes('/health'))
  assert.ok(routes.includes('/api/v1/health'))
  assert.ok(routes.includes('/api/v1/auth/wechat'))
  assert.ok(routes.includes('/api/v1/actions'))
  assert.equal(routes.some((path) => String(path).startsWith('/internal/')), false)
  const internal = app.router.stack.find((layer) => layer.route?.path === '/health')
  const publicRoute = app.router.stack.find((layer) => layer.route?.path === '/api/v1/health')
  assert.equal(internal.route.stack[0].handle, publicRoute.route.stack[0].handle)
})

test('protected and undefined API routes return stable JSON status codes', async (context) => {
  const server = createServer(appFixture())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => server.close())
  const origin = `http://127.0.0.1:${server.address().port}`

  const protectedResponse = await fetch(`${origin}/api/v1/actions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'getConsentStatus', payload: {} })
  })
  assert.equal(protectedResponse.status, 401)
  assert.deepEqual(await protectedResponse.json(), { error: 'SESSION_INVALID_OR_EXPIRED' })

  const missingResponse = await fetch(`${origin}/api/v1/not-defined`)
  assert.equal(missingResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), { error: 'API_ROUTE_NOT_FOUND' })

  const missingShareResponse = await fetch(`${origin}/api/v1/share-cards/not-a-valid-token`)
  assert.equal(missingShareResponse.status, 404)
  assert.deepEqual(await missingShareResponse.json(), { error: 'SHARE_CARD_UNAVAILABLE' })
})
