import type { CaptureDraft } from '../../domain/types'
import { AssessmentClient, CONSENT_VERSION } from '../../services/assessment-client'
import { CaptureDraftStore } from '../../services/capture-draft-store'
import { LocalTaskStore } from '../../services/local-task-store'
import { MediaService } from '../../services/media-service'
import { TaskMediaStore } from '../../services/task-media-store'
import { isOnline } from '../../services/network-service'

Page({
  uploadOperation: null as ReturnType<typeof MediaService.createPrivateUpload> | null,
  uploadCancelled: false,
  data: {
    draft: null as CaptureDraft | null,
    sizeText: '',
    uploadProgress: 0,
    busy: false
  },
  onLoad() {
    const draft = CaptureDraftStore.get()
    if (!draft) {
      wx.showToast({ title: '没有待确认的照片', icon: 'none' })
      return wx.reLaunch({ url: '/pages/practice/index' })
    }
    this.setData({ draft, sizeText: `${(draft.size / 1024 / 1024).toFixed(1)} MB` })
  },
  async confirmUpload() {
    const draft = this.data.draft
    if (!draft || this.data.busy) return
    if (!(await isOnline())) return this.saveOffline()
    this.setData({ busy: true })
    wx.showLoading({ title: '正在上传', mask: true })
    try {
      const task = await AssessmentClient.createUploadTask({
        localTaskId: draft.localTaskId,
        idempotencyKey: draft.idempotencyKey,
        expectedText: draft.expectedText,
        consentVersion: CONSENT_VERSION
      })
      if (!task.privateUploadPath) throw new Error('上传任务缺少私有路径')
      TaskMediaStore.bind({
        taskId: task.taskId,
        localTaskId: draft.localTaskId,
        savedFilePath: draft.savedFilePath,
        imageWidth: draft.imageWidth,
        imageHeight: draft.imageHeight,
        mediaFormat: draft.mediaFormat,
        createdAt: draft.createdAt
      })
      const digest = await MediaService.sha256(draft.savedFilePath)
      this.uploadCancelled = false
      this.uploadOperation = MediaService.createPrivateUpload(
        `${task.privateUploadPath}.${MediaService.extension(draft.mediaFormat)}`,
        draft.savedFilePath,
        (uploadProgress) => this.setData({ uploadProgress })
      )
      const cloudFileId = await this.uploadOperation.result
      await AssessmentClient.submitAssessment({
        taskId: task.taskId,
        cloudFileId,
        imageSha256: digest
      })
      CaptureDraftStore.clear()
      wx.redirectTo({ url: `/pages/progress/index?taskId=${encodeURIComponent(task.taskId)}` })
    } catch (error) {
      if (!this.uploadCancelled) {
        wx.showToast({ title: error instanceof Error ? error.message : '上传失败，请重试', icon: 'none' })
      }
    } finally {
      this.uploadOperation = null
      wx.hideLoading()
      this.setData({ busy: false })
    }
  },
  cancelUpload() {
    this.uploadCancelled = true
    this.uploadOperation?.abort()
    wx.showToast({ title: '已取消上传，照片仍保留', icon: 'none' })
  },
  saveOffline() {
    const draft = this.data.draft
    if (!draft) return
    LocalTaskStore.put({
      localTaskId: draft.localTaskId,
      idempotencyKey: draft.idempotencyKey,
      expectedText: draft.expectedText,
      savedFilePath: draft.savedFilePath,
      imageWidth: draft.imageWidth,
      imageHeight: draft.imageHeight,
      mediaFormat: draft.mediaFormat,
      status: 'pending_local',
      createdAt: draft.createdAt
    })
    CaptureDraftStore.clear()
    wx.showToast({ title: '已保存，联网后提交', icon: 'none' })
    setTimeout(() => wx.reLaunch({ url: '/pages/practice/index' }), 500)
  },
  async retake() {
    const target = encodeURIComponent(this.data.draft?.expectedText ?? '')
    if (this.data.draft) await this.removeDraftMedia(this.data.draft)
    CaptureDraftStore.clear()
    wx.reLaunch({ url: `/pages/practice/index?character=${target}&capture=1` })
  },
  async cancel() {
    if (this.data.draft) await this.removeDraftMedia(this.data.draft)
    CaptureDraftStore.clear()
    wx.navigateBack()
  },
  async removeDraftMedia(draft: CaptureDraft) {
    const paths = new Set([
      draft.savedFilePath,
      ...TaskMediaStore.removeByLocalTaskId(draft.localTaskId)
    ])
    await Promise.all([...paths].map((path) => MediaService.removeSaved(path).catch(() => undefined)))
  }
})
