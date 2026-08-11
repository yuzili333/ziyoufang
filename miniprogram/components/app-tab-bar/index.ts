Component({
  properties: {
    current: { type: String, value: 'practice' }
  },
  methods: {
    goPractice() { wx.reLaunch({ url: '/pages/practice/index' }) },
    capture(this: any) { this.triggerEvent('capture') },
    goMine() { wx.reLaunch({ url: '/pages/mine/index' }) }
  }
})
