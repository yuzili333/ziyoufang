import type { FeedbackRecord } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'
import { createLocalId } from '../../utils/id'
import { TaskMediaStore } from '../../services/task-media-store'

Page({
  feedbackIdempotencyKey: createLocalId('feedback'),
  data: {
    taskId: '',
    characterIndex: 0,
    character: '',
    reasonCode: 'recognition_incorrect' as FeedbackRecord['reasonCode'],
    note: '',
    busy: false,
    reasons: [
      { code: 'recognition_incorrect', label: '识别的字不对' },
      { code: 'category_incorrect', label: '问题分类不对' },
      { code: 'score_incorrect', label: '评分明显不合理' },
      { code: 'other', label: '其他问题' }
    ]
  },
  onLoad(query: Record<string, string>) {
    this.setData({
      taskId: query.taskId ?? '',
      characterIndex: Number(query.characterIndex ?? 0),
      character: decodeURIComponent(query.character ?? '')
    })
  },
  setReason(event: WechatMiniprogram.CustomEvent) {
    this.setData({ reasonCode: event.currentTarget.dataset.code })
  },
  onNote(event: WechatMiniprogram.Input) {
    this.setData({ note: event.detail.value.slice(0, 200) })
  },
  async submit() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const feedback = await AssessmentClient.submitStudentFeedback({
        taskId: this.data.taskId,
        characterIndex: this.data.characterIndex,
        feedbackIdempotencyKey: this.feedbackIdempotencyKey,
        reasonCode: this.data.reasonCode,
        note: this.data.note
      })
      TaskMediaStore.clone(this.data.taskId, feedback.reassessmentTaskId)
      wx.redirectTo({
        url: `/pages/progress/index?taskId=${encodeURIComponent(feedback.reassessmentTaskId)}`
      })
    } catch {
      wx.showToast({ title: '反馈提交失败，请重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  }
})
