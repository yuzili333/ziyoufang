import type { CaptureDraft } from '../../domain/types'
import { AssessmentClient, CONSENT_VERSION } from '../../services/assessment-client'
import { CaptureDraftStore } from '../../services/capture-draft-store'
import { LocalTaskStore } from '../../services/local-task-store'
import { MediaService } from '../../services/media-service'
import { TaskMediaStore } from '../../services/task-media-store'
import { isOnline } from '../../services/network-service'
import { createLocalId } from '../../utils/id'

Page({
  uploadOperation: null as ReturnType<typeof MediaService.createPrivateUpload> | null,
  serverTaskId: null as string | null,
  uploadCancelled: false,
  data: {
    draft: null as CaptureDraft | null,
    sizeText: '',
    uploadProgress: 0,
    uploadingFile: false,
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
      this.serverTaskId = task.taskId
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
      const ticket = await AssessmentClient.createUploadTicket({
        taskId: task.taskId,
        extension: MediaService.extension(draft.mediaFormat)
      })
      this.uploadCancelled = false
      this.setData({ uploadingFile: true })
      this.uploadOperation = MediaService.createPrivateUpload(
        ticket,
        draft.savedFilePath,
        (uploadProgress) => this.setData({ uploadProgress })
      )
      const uploaded = await this.uploadOperation.result
      await AssessmentClient.submitAssessment({
        taskId: task.taskId,
        mediaId: uploaded.mediaId,
        imageSha256: digest,
        etag: uploaded.etag
      })
      CaptureDraftStore.clear()
      this.serverTaskId = null
      wx.redirectTo({ url: `/pages/progress/index?taskId=${encodeURIComponent(task.taskId)}` })
    } catch (error) {
      if (!this.uploadCancelled) {
        wx.showToast({ title: error instanceof Error ? error.message : '上传失败，请重试', icon: 'none' })
      }
    } finally {
      this.uploadOperation = null
      this.setData({ uploadingFile: false })
      wx.hideLoading()
      this.setData({ busy: false })
    }
  },
  async cancelUpload() {
    if (!this.data.uploadingFile || this.uploadCancelled) return
    this.uploadCancelled = true
    this.uploadOperation?.abort()
    const task = await this.cancelServerTask()
    if (!task) {
      wx.showToast({ title: '取消同步失败，照片仍保留', icon: 'none' })
      return
    }
    if (['completed', 'partially_completed'].includes(task.status)) {
      CaptureDraftStore.clear()
      this.serverTaskId = null
      return wx.redirectTo({ url: `/pages/results/index?taskId=${encodeURIComponent(task.taskId)}` })
    }
    if (task.status !== 'cancelled') {
      wx.showToast({ title: '任务状态已变化，请稍后查看', icon: 'none' })
      return
    }
    this.rotateCancelledDraft()
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
    if (!(await this.cancelServerTaskIfNeeded())) return
    if (this.data.draft) await this.removeDraftMedia(this.data.draft)
    CaptureDraftStore.clear()
    wx.reLaunch({ url: `/pages/practice/index?character=${target}&capture=1` })
  },
  async cancel() {
    if (!(await this.cancelServerTaskIfNeeded())) return
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
  },
  async cancelServerTask() {
    if (!this.serverTaskId) return null
    try {
      return await AssessmentClient.cancelAssessment(this.serverTaskId)
    } catch {
      return null
    }
  },
  async cancelServerTaskIfNeeded() {
    if (!this.serverTaskId) return true
    const task = await this.cancelServerTask()
    if (!task || !['cancelled', 'completed', 'partially_completed'].includes(task.status)) {
      wx.showToast({ title: '无法确认服务端取消，请稍后重试', icon: 'none' })
      return false
    }
    this.serverTaskId = null
    if (['completed', 'partially_completed'].includes(task.status)) {
      CaptureDraftStore.clear()
      wx.redirectTo({ url: `/pages/results/index?taskId=${encodeURIComponent(task.taskId)}` })
      return false
    }
    return true
  },
  rotateCancelledDraft() {
    const draft = this.data.draft
    if (!draft) return
    TaskMediaStore.removeByLocalTaskId(draft.localTaskId)
    const nextDraft: CaptureDraft = {
      ...draft,
      localTaskId: createLocalId('local'),
      idempotencyKey: createLocalId('idem')
    }
    CaptureDraftStore.put(nextDraft)
    this.serverTaskId = null
    this.setData({ draft: nextDraft, uploadProgress: 0 })
  }
})
