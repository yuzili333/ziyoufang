import type { CaptureDraft } from '../domain/types'

const KEY = 'ziyoufang.captureDraft.v1'

export const CaptureDraftStore = {
  get(): CaptureDraft | null { return wx.getStorageSync<CaptureDraft>(KEY) ?? null },
  put(draft: CaptureDraft) { wx.setStorageSync(KEY, draft) },
  clear() { wx.removeStorageSync(KEY) }
}
