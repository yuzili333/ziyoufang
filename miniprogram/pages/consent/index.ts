import { AssessmentClient, CONSENT_VERSION } from '../../services/assessment-client'
import { ConsentCache } from '../../services/consent-cache'

Page({
  data: {
    mode: 'entry',
    loading: true,
    active: false,
    privacyNoticeRead: false,
    guardianConfirmed: false,
    busy: false,
    consentVersion: CONSENT_VERSION
  },
  onLoad(query: Record<string, string>) {
    this.setData({ mode: query.mode === 'manage' ? 'manage' : 'entry' })
    this.loadStatus()
  },
  async loadStatus() {
    try {
      const status = await AssessmentClient.getConsentStatus()
      ConsentCache.setActive(status.active)
      this.setData({ active: status.active, loading: false })
      if (status.active && this.data.mode === 'entry') wx.reLaunch({ url: '/pages/practice/index' })
    } catch {
      if (this.data.mode === 'entry' && ConsentCache.isActive()) {
        wx.showToast({ title: '当前离线，可先拍照并保存', icon: 'none' })
        return wx.reLaunch({ url: '/pages/practice/index' })
      }
      this.setData({ loading: false })
      wx.showToast({ title: '授权状态读取失败', icon: 'none' })
    }
  },
  toggleNotice() { this.setData({ privacyNoticeRead: !this.data.privacyNoticeRead }) },
  toggleGuardian() { this.setData({ guardianConfirmed: !this.data.guardianConfirmed }) },
  async agree() {
    if (!this.data.privacyNoticeRead || !this.data.guardianConfirmed) {
      return wx.showToast({ title: '请完成阅读和监护人确认', icon: 'none' })
    }
    this.setData({ busy: true })
    try {
      await AssessmentClient.recordConsent()
      ConsentCache.setActive(true)
      this.setData({ active: true })
      wx.reLaunch({ url: '/pages/practice/index' })
    } catch {
      wx.showToast({ title: '确认失败，请重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },
  async withdraw() {
    this.setData({ busy: true })
    try {
      await AssessmentClient.withdrawConsent()
      ConsentCache.setActive(false)
      this.setData({ active: false, privacyNoticeRead: false, guardianConfirmed: false })
      wx.showToast({ title: '已撤回，新的图片将无法上传', icon: 'none' })
    } catch {
      wx.showToast({ title: '撤回失败，请重试', icon: 'none' })
    } finally {
      this.setData({ busy: false })
    }
  },
  viewDeletionHistory() { wx.navigateTo({ url: '/pages/deletion-history/index' }) },
  leave() { wx.reLaunch({ url: '/pages/mine/index' }) }
})
