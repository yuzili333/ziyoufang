Page({
  goWordbook() { wx.navigateTo({ url: '/pages/wordbook/index' }) },
  goPrivacy() { wx.navigateTo({ url: '/pages/consent/index?mode=manage' }) },
  goFeedbackHistory() { wx.navigateTo({ url: '/pages/feedback-history/index' }) },
  capture() { wx.reLaunch({ url: '/pages/practice/index?capture=1' }) }
})
