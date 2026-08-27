import type { TaskMediaBinding } from '../domain/types'

const KEY = 'ziyoufang.taskMedia.v1'
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const read = (): TaskMediaBinding[] => wx.getStorageSync<TaskMediaBinding[]>(KEY) ?? []
const write = (items: TaskMediaBinding[]) => {
  if (items.length) wx.setStorageSync(KEY, items)
  else wx.removeStorageSync(KEY)
}

export const TaskMediaStore = {
  get(taskId: string): TaskMediaBinding | null {
    return read().find((item) => item.taskId === taskId && Date.parse(item.expiresAt) > Date.now()) ?? null
  },
  bind(input: Omit<TaskMediaBinding, 'sourceTaskId' | 'expiresAt'> & {
    sourceTaskId?: string
    expiresAt?: string
  }) {
    const binding: TaskMediaBinding = {
      ...input,
      sourceTaskId: input.sourceTaskId ?? input.taskId,
      expiresAt: input.expiresAt ?? new Date(Date.parse(input.createdAt) + RETENTION_MS).toISOString()
    }
    write([binding, ...read().filter((item) => item.taskId !== binding.taskId)])
    return binding
  },
  clone(sourceTaskId: string, taskId: string): TaskMediaBinding | null {
    const source = this.get(sourceTaskId)
    if (!source) return null
    return this.bind({
      ...source,
      taskId,
      sourceTaskId: source.sourceTaskId,
      parentTaskId: sourceTaskId
    })
  },
  removeByLocalTaskId(localTaskId: string): string[] {
    const items = read()
    const removed = items.filter((item) => item.localTaskId === localTaskId)
    write(items.filter((item) => item.localTaskId !== localTaskId))
    return [...new Set(removed.map((item) => item.savedFilePath))]
  },
  removeFamily(taskId: string): string[] {
    const items = read()
    const taskIds = new Set([taskId])
    let expanded = true
    while (expanded) {
      expanded = false
      for (const item of items) {
        if (item.parentTaskId && taskIds.has(item.parentTaskId) && !taskIds.has(item.taskId)) {
          taskIds.add(item.taskId)
          expanded = true
        }
      }
    }
    const removed = items.filter((item) => taskIds.has(item.taskId))
    write(items.filter((item) => !removed.includes(item)))
    return [...new Set(removed.map((item) => item.savedFilePath))]
  },
  activePaths(now = Date.now()): Set<string> {
    return new Set(read()
      .filter((item) => Date.parse(item.expiresAt) > now)
      .map((item) => item.savedFilePath))
  },
  pruneExpired(now = Date.now(), protectedPaths = new Set<string>()): string[] {
    const items = read()
    const expired = items.filter((item) => Date.parse(item.expiresAt) <= now)
    const activePaths = new Set(items
      .filter((item) => Date.parse(item.expiresAt) > now)
      .map((item) => item.savedFilePath))
    write(items.filter((item) => Date.parse(item.expiresAt) > now))
    return [...new Set(expired.map((item) => item.savedFilePath))]
      .filter((path) => !activePaths.has(path) && !protectedPaths.has(path))
  }
}
