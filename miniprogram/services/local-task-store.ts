import type { LocalPendingTask } from '../domain/types'

const KEY = 'ziyoufang.pendingTasks.v1'
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const read = (): LocalPendingTask[] => wx.getStorageSync<LocalPendingTask[]>(KEY) ?? []

export const LocalTaskStore = {
  list: read,
  put(task: LocalPendingTask) {
    const tasks = read().filter((item) => item.localTaskId !== task.localTaskId)
    wx.setStorageSync(KEY, [task, ...tasks])
  },
  remove(localTaskId: string) {
    const tasks = read().filter((item) => item.localTaskId !== localTaskId)
    if (tasks.length) wx.setStorageSync(KEY, tasks)
    else wx.removeStorageSync(KEY)
  },
  activePaths(now = Date.now()): Set<string> {
    return new Set(read().filter((item) => {
      const createdAt = Date.parse(item.createdAt)
      return Number.isFinite(createdAt) && createdAt + RETENTION_MS > now
    }).map((item) => item.savedFilePath))
  },
  pruneExpired(now = Date.now(), protectedPaths = new Set<string>()): string[] {
    const tasks = read()
    const expired = tasks.filter((item) => {
      const createdAt = Date.parse(item.createdAt)
      return !Number.isFinite(createdAt) || createdAt + RETENTION_MS <= now
    })
    if (expired.length === 0) return []
    const activePaths = new Set(tasks
      .filter((item) => !expired.includes(item))
      .map((item) => item.savedFilePath))
    const activeTasks = tasks.filter((item) => !expired.includes(item))
    if (activeTasks.length) wx.setStorageSync(KEY, activeTasks)
    else wx.removeStorageSync(KEY)
    return [...new Set(expired.map((item) => item.savedFilePath))]
      .filter((path) => !activePaths.has(path) && !protectedPaths.has(path))
  }
}
