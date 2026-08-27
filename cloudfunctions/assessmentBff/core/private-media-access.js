function createPrivateMediaAccessResolver({ repository, getTempFileURL, now = () => Date.now() }) {
  if (!repository?.getMediaObject) throw new Error('MEDIA_REPOSITORY_REQUIRED')
  if (typeof getTempFileURL !== 'function') throw new Error('TEMP_FILE_URL_PROVIDER_REQUIRED')
  return async ({ cloudFileId, task }) => {
    const media = task.sourceMediaId ? await repository.getMediaObject(task.sourceMediaId) : null
    if (!media || media.privateObjectRef !== cloudFileId || media.lifecycleStatus !== 'active') {
      throw new Error('PRIVATE_MEDIA_UNAVAILABLE')
    }
    const mediaExpiresAt = Date.parse(media.expiresAt)
    if (!Number.isFinite(mediaExpiresAt) || mediaExpiresAt <= now()) {
      throw new Error('PRIVATE_MEDIA_EXPIRED')
    }
    const result = await getTempFileURL({ fileList: [cloudFileId] })
    const file = result.fileList?.[0]
    if (file?.fileID !== cloudFileId || file.status !== 0 || !file.tempFileURL) {
      throw new Error('PRIVATE_MEDIA_ACCESS_UNAVAILABLE')
    }
    const url = new URL(file.tempFileURL)
    if (url.protocol !== 'https:') throw new Error('PRIVATE_MEDIA_ACCESS_INSECURE')
    return {
      url: url.toString(),
      expiresAt: new Date(now() + 10 * 60 * 1000).toISOString()
    }
  }
}

module.exports = { createPrivateMediaAccessResolver }
