import type { LocalPendingTask } from '../domain/types'

const KEY = 'ziyoufang.pendingTasks.v1'

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
  }
}
