import type { AssessmentTask, DeletionJob } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'
import { createLocalId } from '../../utils/id'
import { MediaService } from '../../services/media-service'
import { TaskMediaStore } from '../../services/task-media-store'

Page({
  requestId: createLocalId('deletion'),
  data: {
    taskId: '',
    loading: true,
    task: null as AssessmentTask | null,
    impactConfirmed: false,
    busy: false,
    failedJob: null as DeletionJob | null
  },
  onLoad(query: Record<string, string>) {
    this.setData({ taskId: query.taskId ?? '' })
    this.load()
  },
  async load() {
    try {
      const task = await AssessmentClient.getAssessment(this.data.taskId)
      this.setData({ task, loading: false })
    } catch {
      this.setData({ loading: false })
      wx.showToast({ title: '练习记录加载失败', icon: 'none' })
    }
  },
  toggleImpact() { this.setData({ impactConfirmed: !this.data.impactConfirmed }) },
  async confirmDelete() {
    if (!this.data.impactConfirmed || this.data.busy) return
    this.setData({ busy: true, failedJob: null })
    try {
      const job = await AssessmentClient.deletePractice({
        taskId: this.data.taskId,
        requestId: this.requestId
      })
      if (job.status === 'completed') {
        for (const path of TaskMediaStore.removeFamily(this.data.taskId)) {
          await MediaService.removeSaved(path).catch(() => undefined)
        }
        wx.showToast({ title: '练习及关联数据已删除', icon: 'none' })
        return setTimeout(() => wx.reLaunch({ url: '/pages/practice/index' }), 600)
      }
      this.setData({ failedJob: job })
    } catch {
      wx.showToast({ title: '删除请求失败，请重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  }
})
