const SECRET_MINIMUM_BYTES = 32

function assertProductionSecrets(values) {
  const entries = Object.entries(values)
  for (const [name, value] of entries) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < SECRET_MINIMUM_BYTES) {
      throw new Error(`${name}_MINIMUM_32_BYTES_REQUIRED`)
    }
  }
  if (new Set(entries.map(([, value]) => value)).size !== entries.length) {
    throw new Error('PRODUCTION_SECRETS_MUST_BE_DISTINCT')
  }
}

module.exports = { assertProductionSecrets, SECRET_MINIMUM_BYTES }
