import type { CharacterGrowth, GrowthPoint } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'

type DisplayPoint = GrowthPoint & { barHeight: number; dateText: string }

Page({
  data: {
    character: '',
    loading: true,
    growth: null as CharacterGrowth | null,
    points: [] as DisplayPoint[],
    versionBreak: false,
    monitoringReasonText: ''
  },
  onLoad(query: Record<string, string>) {
    this.setData({ character: decodeURIComponent(query.character ?? '') })
    this.loadGrowth()
  },
  async onPullDownRefresh() { await this.loadGrowth(); wx.stopPullDownRefresh() },
  async loadGrowth() {
    try {
      const growth = await AssessmentClient.getCharacterGrowth(this.data.character)
      const current = growth.segments[growth.segments.length - 1]
      const points = (current?.points ?? []).map((point) => ({
        ...point,
        barHeight: Math.max(30, Math.round(point.totalScore * 2.2)),
        dateText: point.assessedAt.slice(5, 10)
      }))
      const monitoringReasonText = growth.monitoring.reasonCodes
        .map((code) => code === 'LOW_RECENT_AVERAGE' ? '近3次均分偏低' : '书写稳定性偏低')
        .join('、')
      this.setData({
        growth,
        points,
        versionBreak: growth.segments.length > 1,
        monitoringReasonText,
        loading: false
      })
    } catch {
      this.setData({ loading: false })
      wx.showToast({ title: '成长记录加载失败', icon: 'none' })
    }
  },
  practiceAgain() {
    const character = encodeURIComponent(this.data.character)
    wx.reLaunch({ url: `/pages/practice/index?character=${character}&capture=1` })
  }
})
