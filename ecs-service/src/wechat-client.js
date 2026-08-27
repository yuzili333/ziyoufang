class WechatLoginClient {
  constructor({ appId, appSecret, fetchImpl = fetch }) {
    this.appId = appId; this.appSecret = appSecret; this.fetchImpl = fetchImpl
  }
  async exchange(code) {
    if (typeof code !== 'string' || code.trim().length < 6) throw new Error('WECHAT_LOGIN_CODE_INVALID')
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.searchParams.set('appid', this.appId)
    url.searchParams.set('secret', this.appSecret)
    url.searchParams.set('js_code', code.trim())
    url.searchParams.set('grant_type', 'authorization_code')
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('WECHAT_LOGIN_UPSTREAM_FAILED')
    const body = await response.json()
    if (body.errcode || !body.openid) throw new Error('WECHAT_LOGIN_REJECTED')
    return { openid: body.openid, unionid: body.unionid }
  }
}

module.exports = { WechatLoginClient }
