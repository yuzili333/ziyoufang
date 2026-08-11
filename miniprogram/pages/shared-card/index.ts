import type { RedactedSharePayload } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'

Page({
  data: {
    loading: true,
    unavailable: false,
    expiresAt: '',
    payload: null as RedactedSharePayload | null
  },
  onLoad(query: Record<string, string>) {
    this.load(decodeURIComponent(query.token ?? ''))
  },
  async load(token: string) {
    try {
      const card = await AssessmentClient.getSharedCard(token)
      this.setData({ payload: card.payload, expiresAt: card.expiresAt.slice(0, 10), loading: false })
    } catch {
      this.setData({ loading: false, unavailable: true })
    }
  },
  startPractice() { wx.reLaunch({ url: '/pages/consent/index' }) }
})
