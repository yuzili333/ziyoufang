import type { DeletionJob } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'

Page({
  data: {
    loading: true,
    entries: [] as Array<DeletionJob & { statusText: string; dateText: string }>
  },
  onShow() { this.load() },
  async onPullDownRefresh() { await this.load(); wx.stopPullDownRefresh() },
  async load() {
    try {
      const result = await AssessmentClient.getDeletionJobs()
      this.setData({
        loading: false,
        entries: result.entries.map((entry) => ({
          ...entry,
          statusText: entry.status === 'completed' ? '已完成' : entry.status === 'failed' ? '未完成' : '处理中',
          dateText: entry.requestedAt.slice(0, 10)
        }))
      })
    } catch {
      this.setData({ loading: false })
      wx.showToast({ title: '删除记录加载失败', icon: 'none' })
    }
  }
})
