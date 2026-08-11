const sanitizeCodePart = (value) => String(value ?? '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 56)

export class ProviderError extends Error {
  constructor(code, { retryable = false, status = null, cause } = {}) {
    super(code, { cause })
    this.name = 'ProviderError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }
}

export const remoteProviderCode = (prefix, value) => {
  const suffix = sanitizeCodePart(value)
  return suffix ? `${prefix}_${suffix}`.slice(0, 80) : `${prefix}_ERROR`
}

export const isRetryableStatus = (status) => status === 429 || status >= 500

export const statusErrorCode = (status) => {
  if (status === 429) return 'PROVIDER_RATE_LIMITED'
  if (status >= 500) return 'PROVIDER_UNAVAILABLE'
  return 'PROVIDER_REQUEST_REJECTED'
}
