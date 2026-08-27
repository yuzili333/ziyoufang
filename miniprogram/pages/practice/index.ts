import { AssessmentClient, CONSENT_VERSION } from '../../services/assessment-client'
import { CaptureDraftStore } from '../../services/capture-draft-store'
import { LocalTaskStore } from '../../services/local-task-store'
import { MediaService } from '../../services/media-service'
import { TaskMediaStore } from '../../services/task-media-store'
import { isOnline, observeNetworkRecovery } from '../../services/network-service'
import { createLocalId } from '../../utils/id'

Page({
  stopNetworkRecoveryObservation: null as (() => void) | null,
  data: {
    expectedText: '永和春山日月天地人心正学书法美华',
    pendingCount: 0,
    busy: false
  },
  onLoad(query: Record<string, string>) {
    if (query.character) this.setData({ expectedText: decodeURIComponent(query.character) })
    this.stopNetworkRecoveryObservation = observeNetworkRecovery(() => {
      void this.resumePending()
    })
    this.refreshPending()
    if (query.capture === '1') setTimeout(() => this.capture(), 0)
  },
  async onShow() {
    this.refreshPending()
    if (LocalTaskStore.list().length > 0) await this.resumePending()
  },
  onUnload() {
    this.stopNetworkRecoveryObservation?.()
    this.stopNetworkRecoveryObservation = null
  },
  refreshPending() { this.setData({ pendingCount: LocalTaskStore.list().length }) },
  onExpectedText(event: WechatMiniprogram.Input) {
    this.setData({ expectedText: event.detail.value.slice(0, 64) })
  },
  async resumePending() {
    if (this.data.busy || !(await isOnline())) return
    const pending = LocalTaskStore.list()[0]
    if (!pending) return
    this.setData({ busy: true })
    wx.showLoading({ title: '继续上传', mask: true })
    try {
      const task = await AssessmentClient.createUploadTask({
        localTaskId: pending.localTaskId,
        idempotencyKey: pending.idempotencyKey,
        expectedText: pending.expectedText,
        consentVersion: CONSENT_VERSION
      })
      TaskMediaStore.bind({
        taskId: task.taskId,
        localTaskId: pending.localTaskId,
        savedFilePath: pending.savedFilePath,
        imageWidth: pending.imageWidth,
        imageHeight: pending.imageHeight,
        mediaFormat: pending.mediaFormat,
        createdAt: pending.createdAt
      })
      const digest = await MediaService.sha256(pending.savedFilePath)
      const ticket = await AssessmentClient.createUploadTicket({
        taskId: task.taskId,
        extension: MediaService.extension(pending.mediaFormat)
      })
      const uploaded = await MediaService.uploadPrivate(ticket, pending.savedFilePath)
      await AssessmentClient.submitAssessment({
        taskId: task.taskId,
        mediaId: uploaded.mediaId,
        imageSha256: digest,
        etag: uploaded.etag
      })
      LocalTaskStore.remove(pending.localTaskId)
      this.refreshPending()
      wx.navigateTo({ url: `/pages/progress/index?taskId=${encodeURIComponent(task.taskId)}` })
    } catch {
      wx.showToast({ title: '待提交任务仍已保留', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ busy: false })
    }
  },
  async capture() {
    if (this.data.busy) return
    const expectedText = this.data.expectedText.trim()
    if (!expectedText) return wx.showToast({ title: '请先填写练习文字', icon: 'none' })
    this.setData({ busy: true })
    wx.showLoading({ title: '准备练习', mask: true })
    try {
      const media = await MediaService.choosePracticePhoto()
      if (media.size > 15 * 1024 * 1024) throw new Error('图片不能超过15MB')
      const savedFilePath = await MediaService.save(media.path)
      const localTaskId = createLocalId('local')
      const idempotencyKey = createLocalId('idem')
      CaptureDraftStore.put({
        localTaskId,
        idempotencyKey,
        expectedText,
        savedFilePath,
        size: media.size,
        imageWidth: media.width,
        imageHeight: media.height,
        mediaFormat: media.format,
        createdAt: new Date().toISOString()
      })
      wx.navigateTo({ url: '/pages/upload-confirm/index' })
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : '提交失败，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ busy: false })
    }
  }
})
