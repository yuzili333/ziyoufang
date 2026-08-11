import type { AssessmentTask } from '../../domain/types'
import { failureGuidance } from '../../domain/failure-guidance'
import { AssessmentClient } from '../../services/assessment-client'

const stages = [
  { code: 'quality_checking', label: '检查图片' },
  { code: 'segmenting', label: '切分方格' },
  { code: 'recognizing', label: '识别文字' },
  { code: 'comparing', label: '对比字形' },
  { code: 'generating_advice', label: '生成建议' },
  { code: 'persisting_result', label: '保存结果' }
]

Page({
  pollTimer: null as number | null,
  data: {
    taskId: '',
    task: null as AssessmentTask | null,
    stageItems: stages.map((stage) => ({ ...stage, state: 'pending' })),
    failed: false,
    cancelled: false,
    failureTitle: '',
    failureMessage: '',
    failureAction: 'retry' as 'retry' | 'retake',
    busy: false
  },
  onLoad(query: Record<string, string>) {
    this.setData({ taskId: query.taskId ?? '' })
    this.poll()
  },
  onUnload() {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer)
  },
  updateStages(currentStage: string | null) {
    const currentIndex = Math.max(0, stages.findIndex((stage) => stage.code === currentStage))
    return stages.map((stage, index) => ({
      ...stage,
      state: index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'pending'
    }))
  },
  async poll() {
    try {
      const task = await AssessmentClient.getAssessment(this.data.taskId)
      const terminalSuccess = ['completed', 'partially_completed'].includes(task.status)
      const guidance = failureGuidance(task.errorCode, task.retryable !== false)
      this.setData({
        task,
        stageItems: terminalSuccess
          ? stages.map((stage) => ({ ...stage, state: 'done' }))
          : this.updateStages(task.progressStage),
        failed: task.status === 'failed',
        cancelled: task.status === 'cancelled',
        failureTitle: guidance.title,
        failureMessage: guidance.message,
        failureAction: guidance.action
      })
      if (terminalSuccess) {
        return setTimeout(() => wx.redirectTo({
          url: `/pages/results/index?taskId=${encodeURIComponent(task.taskId)}`
        }), 400)
      }
      if (!['failed', 'cancelled'].includes(task.status)) {
        this.pollTimer = setTimeout(() => this.poll(), 1200)
      }
    } catch {
      this.pollTimer = setTimeout(() => this.poll(), 2000)
    }
  },
  async retry() {
    if (this.data.busy || this.data.failureAction !== 'retry') return
    this.setData({ busy: true, failed: false })
    try {
      await AssessmentClient.retryAssessment(this.data.taskId)
      await this.poll()
    } catch {
      this.setData({ failed: true })
      wx.showToast({ title: '暂时无法重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },
  retake() {
    const target = encodeURIComponent(this.data.task?.expectedText ?? '')
    wx.reLaunch({ url: `/pages/practice/index?character=${target}&capture=1` })
  },
  async cancel() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const task = await AssessmentClient.cancelAssessment(this.data.taskId)
      this.setData({ task, cancelled: task.status === 'cancelled' })
    } catch {
      wx.showToast({ title: '取消失败，请重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },
  backToPractice() { wx.reLaunch({ url: '/pages/practice/index' }) }
})
