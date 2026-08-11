import { MediaService } from './services/media-service'
import { TaskMediaStore } from './services/task-media-store'

App({
  onLaunch() {
    if (!wx.cloud) throw new Error('微信基础库不支持云开发，请升级微信后重试')
    wx.cloud.init({ traceUser: false })
    for (const path of TaskMediaStore.pruneExpired()) void MediaService.removeSaved(path).catch(() => undefined)
  }
})
