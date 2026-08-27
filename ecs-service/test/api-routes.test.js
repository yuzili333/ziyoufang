const assert = require('node:assert/strict')
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
    repository: {}, queue: {}, quotaGuard: null, sessions: {}, wechat: {}, media: {},
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
