import { resolveApiBaseUrl } from '../config/api-runtime'

const promiseFromRequest = <T>(options: {
  url: string
  method: 'GET' | 'POST'
  data?: unknown
  header?: Record<string, string>
}) => new Promise<T>((resolve, reject) => wx.request<T>({
  ...options,
  success(response) {
    if (response.statusCode >= 200 && response.statusCode < 300) return resolve(response.data)
    const body = response.data as { error?: string }
    const error = new Error(body?.error ?? `HTTP_${response.statusCode}`)
    ;(error as Error & { statusCode?: number }).statusCode = response.statusCode
    reject(error)
  },
  fail: reject
}))

const loginCode = () => new Promise<string>((resolve, reject) => wx.login({
  success(result) { result.code ? resolve(result.code) : reject(new Error('WECHAT_LOGIN_CODE_MISSING')) },
  fail: reject
}))

let session: { token: string; expiresAt: string } | null = null
let pendingLogin: Promise<string> | null = null

const baseUrl = () => {
  const value = resolveApiBaseUrl()
  if (!value) throw new Error('生产 API 地址尚未配置，发布门禁保持关闭')
  return value
}

const authenticate = async () => {
  if (session && Date.parse(session.expiresAt) > Date.now() + 60_000) return session.token
  if (!pendingLogin) pendingLogin = (async () => {
    const code = await loginCode()
    session = await promiseFromRequest<{ token: string; expiresAt: string }>({
      url: `${baseUrl()}/api/v1/auth/wechat`, method: 'POST', data: { code },
      header: { 'content-type': 'application/json' }
    })
    return session.token
  })().finally(() => { pendingLogin = null })
  return pendingLogin
}

export const HttpClient = {
  clearSession() { session = null },
  async request<T>(path: string, options: { method?: 'GET' | 'POST'; data?: unknown; authenticated?: boolean } = {}) {
    const authenticated = options.authenticated !== false
    const execute = async () => {
      const token = authenticated ? await authenticate() : null
      return promiseFromRequest<T>({
        url: `${baseUrl()}${path}`,
        method: options.method ?? 'POST',
        data: options.data,
        header: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
    }
    try { return await execute() } catch (error) {
      if (authenticated && (error as Error & { statusCode?: number }).statusCode === 401) {
        session = null
        return execute()
      }
      throw error
    }
  }
}
