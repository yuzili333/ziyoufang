export const PRODUCTION_API_BASE_URL: string = 'https://lilicoconut.me'

export function resolveApiBaseUrl(): string | undefined {
  if (PRODUCTION_API_BASE_URL === '__PROD_API_BASE_URL_REQUIRED__') return undefined
  return PRODUCTION_API_BASE_URL.replace(/\/$/, '')
}
