import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { assertProductionSecrets } = require('../core/secret-policy')

test('production application secrets must be at least 32 bytes and purpose-distinct', () => {
  assert.doesNotThrow(() => assertProductionSecrets({
    BFF_HMAC_SECRET: 'b'.repeat(32),
    SUBJECT_ID_HMAC_SECRET: 's'.repeat(32),
    SHARE_TOKEN_SECRET: 't'.repeat(32)
  }))
  assert.throws(() => assertProductionSecrets({ BFF_HMAC_SECRET: 'short' }), /MINIMUM_32_BYTES_REQUIRED/)
  assert.throws(() => assertProductionSecrets({
    BFF_HMAC_SECRET: 'x'.repeat(32),
    SUBJECT_ID_HMAC_SECRET: 'x'.repeat(32)
  }), /PRODUCTION_SECRETS_MUST_BE_DISTINCT/)
})
