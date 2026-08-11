import { createHash } from 'node:crypto'

import { imageLimits } from './image-rgba.mjs'
import { ProviderError } from '../providers/provider-error.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')

export class PrivateHttpMediaLoader {
  constructor({
    allowedHosts,
    fetchImpl = fetch,
    timeoutMs = 10_000,
    maximumBytes = imageLimits.maximumEncodedBytes,
    clock = () => Date.now()
  } = {}) {
    this.allowedHosts = new Set((allowedHosts ?? []).map((host) => String(host).trim().toLowerCase()).filter(Boolean))
    if (this.allowedHosts.size === 0) throw new Error('MEDIA_HOST_ALLOWLIST_REQUIRED')
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000) {
      throw new Error('MEDIA_TIMEOUT_INVALID')
    }
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
    this.maximumBytes = maximumBytes
    this.clock = clock
  }

  async load(task) {
    const access = task?.mediaAccess
    if (!access?.url || !access?.expiresAt) {
      throw new ProviderError('MEDIA_ACCESS_REQUIRED', { retryable: true })
    }
    const expiresAt = Date.parse(access.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= this.clock()) {
      throw new ProviderError('MEDIA_ACCESS_EXPIRED', { retryable: true })
    }
    let url
    try {
      url = new URL(access.url)
    } catch {
      throw new ProviderError('MEDIA_ACCESS_INVALID', { retryable: false })
    }
    if (url.protocol !== 'https:' || url.username || url.password
      || !this.allowedHosts.has(url.hostname.toLowerCase())) {
      throw new ProviderError('MEDIA_HOST_FORBIDDEN', { retryable: false })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: { accept: 'image/jpeg, image/png' }
      })
      if (!response.ok) throw new ProviderError('MEDIA_DOWNLOAD_FAILED', { retryable: response.status >= 500 })
      const announcedLength = Number(response.headers?.get?.('content-length'))
      if (Number.isFinite(announcedLength) && announcedLength > this.maximumBytes) {
        throw new ProviderError('IMAGE_FILE_TOO_LARGE', { retryable: false })
      }
      const chunks = []
      let bytes = 0
      if (!response.body) throw new ProviderError('MEDIA_DOWNLOAD_EMPTY', { retryable: true })
      for await (const chunk of response.body) {
        const value = Buffer.from(chunk)
        bytes += value.length
        if (bytes > this.maximumBytes) {
          throw new ProviderError('IMAGE_FILE_TOO_LARGE', { retryable: false })
        }
        chunks.push(value)
      }
      if (bytes === 0) throw new ProviderError('MEDIA_DOWNLOAD_EMPTY', { retryable: true })
      const image = Buffer.concat(chunks, bytes)
      if (digest(image) !== task.imageSha256) {
        throw new ProviderError('MEDIA_DIGEST_MISMATCH', { retryable: false })
      }
      return image
    } catch (error) {
      if (error instanceof ProviderError) throw error
      if (error?.name === 'AbortError') throw new ProviderError('MEDIA_DOWNLOAD_TIMEOUT', { retryable: true })
      throw new ProviderError('MEDIA_DOWNLOAD_FAILED', { retryable: true })
    } finally {
      clearTimeout(timeout)
    }
  }
}
