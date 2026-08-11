import type { SupportedImageFormat } from '../domain/types'

const promiseFromCallback = <T>(executor: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) =>
  new Promise<T>(executor)

const normalizeFormat = (type?: string): SupportedImageFormat => {
  const normalized = type?.trim().toLowerCase()
  if (normalized === 'jpg' || normalized === 'jpeg') return 'jpeg'
  if (normalized === 'png') return 'png'
  throw new Error('当前仅支持 JPG 或 PNG 图片')
}

export const MediaService = {
  async choosePracticePhoto(): Promise<{
    path: string
    size: number
    width: number
    height: number
    format: SupportedImageFormat
  }> {
    const result = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      camera: 'back'
    })
    const file = result.tempFiles[0]
    if (!file) throw new Error('NO_MEDIA_SELECTED')
    const information = await this.imageInfo(file.tempFilePath)
    return {
      path: file.tempFilePath,
      size: file.size,
      width: information.width,
      height: information.height,
      format: normalizeFormat(information.type)
    }
  },
  imageInfo(path: string): Promise<{ width: number; height: number; type?: string }> {
    return promiseFromCallback((resolve, reject) => wx.getImageInfo({
      src: path,
      success: ({ width, height, type }) => resolve({ width, height, type }),
      fail: reject
    }))
  },
  extension(format: SupportedImageFormat) {
    return format === 'png' ? 'png' : 'jpg'
  },
  save(path: string): Promise<string> {
    return promiseFromCallback((resolve, reject) => wx.getFileSystemManager().saveFile({
      tempFilePath: path,
      success: (result) => resolve(result.savedFilePath),
      fail: reject
    }))
  },
  sha256(path: string): Promise<string> {
    return promiseFromCallback((resolve, reject) => wx.getFileSystemManager().getFileInfo({
      filePath: path,
      digestAlgorithm: 'sha256',
      success: (result) => resolve(result.digest),
      fail: reject
    }))
  },
  removeSaved(path: string): Promise<void> {
    return promiseFromCallback((resolve, reject) => wx.getFileSystemManager().removeSavedFile({
      filePath: path,
      success: resolve,
      fail: reject
    }))
  },
  createPrivateUpload(cloudPath: string, filePath: string, onProgress?: (progress: number) => void) {
    let uploadTask: WechatMiniprogram.UploadTask | null = null
    const result = promiseFromCallback<string>((resolve, reject) => {
      uploadTask = wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (result) => resolve(result.fileID),
        fail: reject
      })
      if (onProgress) uploadTask.onProgressUpdate((result) => onProgress(result.progress))
    })
    return { result, abort: () => uploadTask?.abort() }
  },
  uploadPrivate(cloudPath: string, filePath: string, onProgress?: (progress: number) => void): Promise<string> {
    return this.createPrivateUpload(cloudPath, filePath, onProgress).result
  }
}
