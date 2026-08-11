import { CONSENT_VERSION } from './assessment-client'

const KEY = 'ziyoufang.consentCache.v1'

interface CachedConsent {
  consentVersion: string
  active: boolean
  syncedAt: string
}

export const ConsentCache = {
  isActive() {
    const value = wx.getStorageSync<CachedConsent>(KEY)
    return value?.active === true && value.consentVersion === CONSENT_VERSION
  },
  setActive(active: boolean) {
    wx.setStorageSync(KEY, {
      consentVersion: CONSENT_VERSION,
      active,
      syncedAt: new Date().toISOString()
    } satisfies CachedConsent)
  }
}
