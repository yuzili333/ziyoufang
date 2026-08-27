import { MediaService } from './services/media-service'
import { LocalTaskStore } from './services/local-task-store'
import { TaskMediaStore } from './services/task-media-store'
import { resolveApiBaseUrl } from './config/api-runtime'

App({
  onLaunch() {
    if (!resolveApiBaseUrl()) throw new Error('生产 API 地址尚未配置，发布门禁保持关闭')
    const now = Date.now()
    const localActivePaths = LocalTaskStore.activePaths(now)
    const expiredTaskPaths = TaskMediaStore.pruneExpired(now, localActivePaths)
    const taskActivePaths = TaskMediaStore.activePaths(now)
    const expiredLocalPaths = LocalTaskStore.pruneExpired(now, taskActivePaths)
    const expiredPaths = new Set([...expiredTaskPaths, ...expiredLocalPaths])
    for (const path of expiredPaths) void MediaService.removeSaved(path).catch(() => undefined)
  }
})
