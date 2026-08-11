import type { WordbookEntry } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'

type Filter = 'wrong' | 'correction' | 'monitoring'

Page({
  data: {
    filter: 'monitoring' as Filter,
    loading: true,
    entries: [] as Array<WordbookEntry & { reasonText: string }>
  },
  onShow() { this.loadEntries() },
  async setFilter(event: WechatMiniprogram.CustomEvent) {
    this.setData({ filter: event.currentTarget.dataset.filter as Filter })
    await this.loadEntries()
  },
  async loadEntries() {
    this.setData({ loading: true })
    try {
      const result = await AssessmentClient.getWordbook(this.data.filter)
      const entries = result.entries.map((entry) => ({
        ...entry,
        reasonText: entry.monitoringReasonCodes
          .map((code) => code === 'LOW_RECENT_AVERAGE' ? '近3次均分偏低' : '稳定性偏低')
          .join('、')
      }))
      this.setData({ entries, loading: false })
    } catch {
      this.setData({ loading: false })
      wx.showToast({ title: '字本加载失败', icon: 'none' })
    }
  },
  viewGrowth(event: WechatMiniprogram.CustomEvent) {
    wx.navigateTo({
      url: `/pages/growth/index?character=${encodeURIComponent(event.currentTarget.dataset.character)}`
    })
  },
  practiceAgain(event: WechatMiniprogram.CustomEvent) {
    const character = encodeURIComponent(event.currentTarget.dataset.character)
    wx.reLaunch({ url: `/pages/practice/index?character=${character}&capture=1` })
  }
})
