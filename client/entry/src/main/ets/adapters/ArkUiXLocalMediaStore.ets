import fs from '@ohos.file.fs'
import statvfs from '@ohos.file.statvfs'
import common from '@ohos.app.ability.common'
import { LocalMediaStore } from '../services/LocalMediaStore'

const FILE_SCHEME: string = 'file://'

export class ArkUiXLocalMediaStore implements LocalMediaStore {
  private context: common.UIAbilityContext
  private mediaDir: string
  private transientDir: string

  constructor(context: common.UIAbilityContext) {
    this.context = context
    this.mediaDir = `${context.filesDir}/practice-media`
    this.transientDir = `${context.cacheDir}/practice-media`
    this.ensureDirectory(this.mediaDir)
    this.ensureDirectory(this.transientDir)
  }

  async save(sourceUri: string, localTaskId: string): Promise<string> {
    const safeTaskId = localTaskId.replace(/[^A-Za-z0-9_-]/g, '_')
    const destination = `${this.mediaDir}/${safeTaskId}.jpg`
    let sourceFd: number = -1
    let targetFd: number = -1
    try {
      sourceFd = fs.openSync(this.pathFromUri(sourceUri), fs.OpenMode.READ_ONLY).fd
      targetFd = fs.openSync(destination,
        fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC).fd
      fs.copyFileSync(sourceFd, targetFd)
    } catch (error) {
      throw new Error(`MEDIA_SAVE_FAILED: ${error}`)
    } finally {
      this.closeQuietly(sourceFd)
      this.closeQuietly(targetFd)
    }
    return `${FILE_SCHEME}${destination}`
  }

  exists(uri: string): Promise<boolean> {
    try {
      return Promise.resolve(fs.accessSync(this.pathFromUri(uri)))
    } catch (error) {
      throw new Error(`MEDIA_ACCESS_FAILED: ${error}`)
    }
  }

  delete(uri: string): Promise<void> {
    try {
      const path = this.pathFromUri(uri)
      if (fs.accessSync(path)) {
        fs.unlinkSync(path)
      }
      return Promise.resolve()
    } catch (error) {
      throw new Error(`MEDIA_DELETE_FAILED: ${error}`)
    }
  }

  availableBytes(): Promise<number> {
    try {
      return statvfs.getFreeSize(this.context.filesDir)
    } catch (error) {
      throw new Error(`MEDIA_CAPACITY_CHECK_FAILED: ${error}`)
    }
  }

  clearTransientCache(): Promise<void> {
    try {
      if (!fs.accessSync(this.transientDir)) {
        return Promise.resolve()
      }
      const names = fs.listFileSync(this.transientDir)
      names.forEach((name: string) => {
        const path = `${this.transientDir}/${name}`
        if (fs.accessSync(path)) {
          fs.unlinkSync(path)
        }
      })
      return Promise.resolve()
    } catch (error) {
      throw new Error(`MEDIA_CACHE_CLEAR_FAILED: ${error}`)
    }
  }

  private ensureDirectory(path: string): void {
    try {
      if (!fs.accessSync(path)) {
        fs.mkdirSync(path, true)
      }
    } catch (error) {
      throw new Error(`MEDIA_DIRECTORY_CREATE_FAILED: ${error}`)
    }
  }

  private closeQuietly(fd: number): void {
    if (fd < 0) {
      return
    }
    try {
      fs.closeSync(fd)
    } catch (_error) {
      // Preserve the primary save error; no media path or assessment data is logged.
    }
  }

  private pathFromUri(uri: string): string {
    if (uri.startsWith(FILE_SCHEME)) {
      return uri.substring(FILE_SCHEME.length)
    }
    return uri
  }
}
