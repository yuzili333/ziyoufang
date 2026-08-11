declare function App(options: Record<string, unknown>): void
declare function Page(options: any): void
declare function Component(options: any): void
declare function getApp<T = any>(): T
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number): number
declare function clearTimeout(timeout?: number): void

declare namespace WechatMiniprogram {
  interface CustomEvent<T = Record<string, unknown>> {
    detail: T
    currentTarget: { dataset: Record<string, any> }
  }
  interface Input { detail: { value: string } }
  interface UploadTask {
    onProgressUpdate(handler: (result: { progress: number; totalBytesSent: number; totalBytesExpectedToSend: number }) => void): void
    abort(): void
  }
}

declare const wx: {
  cloud: {
    init(options: { traceUser: boolean }): void
    callFunction<T>(options: { name: string; data: unknown }): Promise<{ result: T }>
    uploadFile(options: {
      cloudPath: string
      filePath: string
      success(result: { fileID: string }): void
      fail(error: unknown): void
    }): WechatMiniprogram.UploadTask
  }
  chooseMedia(options: {
    count: number
    mediaType: string[]
    sourceType: string[]
    camera: string
  }): Promise<{ tempFiles: Array<{ tempFilePath: string; size: number; width?: number; height?: number }> }>
  getImageInfo(options: {
    src: string
    success(result: { width: number; height: number; type?: string; orientation?: string; path?: string }): void
    fail(error: unknown): void
  }): void
  getFileSystemManager(): {
    saveFile(options: { tempFilePath: string; success(result: { savedFilePath: string }): void; fail(error: unknown): void }): void
    getFileInfo(options: { filePath: string; digestAlgorithm: 'sha256'; success(result: { digest: string }): void; fail(error: unknown): void }): void
    removeSavedFile(options: { filePath: string; success(): void; fail(error: unknown): void }): void
  }
  getNetworkType(options: { success(result: { networkType: string }): void; fail(error: unknown): void }): void
  getStorageSync<T>(key: string): T
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
  navigateTo(options: { url: string }): void
  redirectTo(options: { url: string }): void
  navigateBack(options?: { delta?: number }): void
  reLaunch(options: { url: string }): void
  showToast(options: { title: string; icon?: 'none' | 'success' | 'loading' }): void
  showLoading(options: { title: string; mask?: boolean }): void
  hideLoading(): void
  stopPullDownRefresh(): void
}
