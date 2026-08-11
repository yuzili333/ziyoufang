import photoAccessHelper from '@ohos.file.photoAccessHelper'
import image from '@ohos.multimedia.image'
import { CaptureResult, CaptureService, CaptureSource } from '../services/CaptureService'
import { PlatformCameraBridge } from './PlatformCameraBridge'

export class ArkUiXCaptureService implements CaptureService {
  private cameraBridge: PlatformCameraBridge

  constructor(cameraBridge: PlatformCameraBridge) {
    this.cameraBridge = cameraBridge
  }

  requestCameraPermission(): Promise<boolean> {
    return this.cameraBridge.requestPermission()
  }

  capture(): Promise<CaptureResult> {
    return this.cameraBridge.capture()
  }

  async pickFromLibrary(): Promise<CaptureResult> {
    const options = new photoAccessHelper.PhotoSelectOptions()
    options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE
    options.maxSelectNumber = 1

    const picker = new photoAccessHelper.PhotoViewPicker()
    let selection: photoAccessHelper.PhotoSelectResult
    try {
      selection = await picker.select(options)
    } catch (error) {
      throw new Error(`PHOTO_PICKER_FAILED: ${error}`)
    }
    if (selection.photoUris.length === 0) {
      throw new Error('PHOTO_PICKER_CANCELLED')
    }

    const uri = selection.photoUris[0]
    const source = image.createImageSource(uri)
    try {
      const info = await source.getImageInfo()
      return new CaptureResult(uri, info.size.width, info.size.height, 0, CaptureSource.PHOTO_LIBRARY)
    } finally {
      await source.release()
    }
  }

  cancel(): void {
    this.cameraBridge.cancel()
  }
}
