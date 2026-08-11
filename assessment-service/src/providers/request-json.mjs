import { ProviderError, isRetryableStatus, statusErrorCode } from './provider-error.mjs'

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function requestJson({
  fetchImpl = globalThis.fetch,
  createRequest,
  validateBody,
  timeoutMs,
  maximumAttempts,
  sleep = defaultSleep
}) {
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_IMPLEMENTATION_REQUIRED')
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const request = createRequest(attempt)
      const response = await fetchImpl(request.url, {
        ...request.options,
        signal: controller.signal
      })
      const text = await response.text()
      let body
      try {
        body = text ? JSON.parse(text) : {}
      } catch {
        throw new ProviderError('PROVIDER_RESPONSE_INVALID', { retryable: response.status >= 500 })
      }
      if (!response.ok) {
        throw new ProviderError(statusErrorCode(response.status), {
          retryable: isRetryableStatus(response.status),
          status: response.status
        })
      }
      if (validateBody) validateBody(body)
      return { body, headers: response.headers, status: response.status, attempt }
    } catch (error) {
      const normalized = error?.name === 'AbortError'
        ? new ProviderError('PROVIDER_TIMEOUT', { retryable: true, cause: error })
        : error instanceof ProviderError
          ? error
          : new ProviderError('PROVIDER_NETWORK_ERROR', { retryable: true, cause: error })
      if (!normalized.retryable || attempt === maximumAttempts) throw normalized
      await sleep(Math.min(1000, 100 * (2 ** (attempt - 1))))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new ProviderError('PROVIDER_ATTEMPTS_EXHAUSTED')
}
