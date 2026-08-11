import type { AssessmentTask, RedactedSharePayload } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'
import { createLocalId } from '../../utils/id'

Page({
  shareIdempotencyKey: createLocalId('share'),
  data: {
    taskId: '',
    loading: true,
    preview: null as RedactedSharePayload | null,
    guardianConfirmed: false,
    redactionConfirmed: false,
    busy: false,
    shareCardId: '',
    shareToken: '',
    expiresAt: '',
    revoked: false
  },
  onLoad(query: Record<string, string>) {
    this.setData({ taskId: query.taskId ?? '' })
    this.loadPreview()
  },
  async loadPreview() {
    try {
      const task = await AssessmentClient.getAssessment(this.data.taskId)
      const preview: RedactedSharePayload = {
        productName: '字有方',
        targetText: task.characters?.map((item) => item.expectedCharacter).join('') ?? '',
        resultStatus: task.status as RedactedSharePayload['resultStatus'],
        summary: task.summary,
        characters: (task.characters ?? []).map((character) => ({
          expectedCharacter: character.expectedCharacter,
          category: character.category,
          score: character.score,
          advice: character.correctionSteps.slice(0, 1)
        }))
      }
      this.setData({ preview, loading: false })
    } catch {
      this.setData({ loading: false })
      wx.showToast({ title: '分享预览加载失败', icon: 'none' })
    }
  },
  toggleGuardian() { this.setData({ guardianConfirmed: !this.data.guardianConfirmed }) },
  toggleRedaction() { this.setData({ redactionConfirmed: !this.data.redactionConfirmed }) },
  async createCard() {
    if (!this.data.guardianConfirmed || !this.data.redactionConfirmed || this.data.busy) return
    this.setData({ busy: true })
    try {
      const result = await AssessmentClient.createShareCard({
        taskId: this.data.taskId,
        shareIdempotencyKey: this.shareIdempotencyKey
      })
      this.setData({
        preview: result.preview,
        shareCardId: result.shareCardId,
        shareToken: result.shareToken,
        expiresAt: result.expiresAt.slice(0, 10),
        revoked: false
      })
    } catch {
      wx.showToast({ title: '分享卡生成失败', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },
  async revoke() {
    if (!this.data.shareCardId || this.data.busy) return
    this.setData({ busy: true })
    try {
      await AssessmentClient.revokeShareCard(this.data.shareCardId)
      this.setData({ revoked: true, shareToken: '' })
      wx.showToast({ title: '分享访问已撤销', icon: 'none' })
    } catch {
      wx.showToast({ title: '撤销失败，请重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },
  onShareAppMessage() {
    return {
      title: '我的汉字练习小结',
      path: `/pages/shared-card/index?token=${encodeURIComponent(this.data.shareToken)}`
    }
  }
})
