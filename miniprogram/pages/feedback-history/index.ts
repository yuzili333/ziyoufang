import type { FeedbackRecord } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'

Page({
  data: {
    loading: true,
    entries: [] as Array<FeedbackRecord & { reasonText: string; dateText: string }>
  },
  onShow() { this.load() },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh() },
  async load() {
    try {
      const result = await AssessmentClient.getFeedbackRecords()
      const labels: Record<string, string> = {
        recognition_incorrect: '识别的字不对',
        category_incorrect: '问题分类不对',
        score_incorrect: '评分明显不合理',
        other: '其他问题'
      }
      this.setData({
        loading: false,
        entries: result.entries.map((entry) => ({
          ...entry,
          reasonText: labels[entry.reasonCode],
          dateText: entry.createdAt.slice(0, 10)
        }))
      })
    } catch {
      this.setData({ loading: false })
      wx.showToast({ title: '反馈记录加载失败', icon: 'none' })
    }
  },
  viewResult(event: WechatMiniprogram.CustomEvent) {
    wx.navigateTo({ url: `/pages/results/index?taskId=${encodeURIComponent(event.currentTarget.dataset.taskId)}` })
  }
})
