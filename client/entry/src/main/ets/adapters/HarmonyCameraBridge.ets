import abilityAccessCtrl from '@ohos.abilityAccessCtrl'
import common from '@ohos.app.ability.common'
import camera from '@ohos.multimedia.camera'
import cameraPicker from '@ohos.multimedia.cameraPicker'
import image from '@ohos.multimedia.image'
import { CaptureResult, CaptureSource } from '../services/CaptureService'
import { PlatformCameraBridge } from './PlatformCameraBridge'

/** HarmonyOS Camera Kit implementation using the system photo capture surface. */
export class HarmonyCameraBridge implements PlatformCameraBridge {
  private context: common.UIAbilityContext
  private cancelled: boolean = false

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  async requestPermission(): Promise<boolean> {
    const manager = abilityAccessCtrl.createAtManager()
    try {
      const result = await manager.requestPermissionsFromUser(this.context, ['ohos.permission.CAMERA'])
      return result.authResults.length > 0 && result.authResults[0] === 0
    } catch (error) {
      throw new Error(`CAMERA_PERMISSION_REQUEST_FAILED: ${error}`)
    }
  }

  async capture(): Promise<CaptureResult> {
    this.cancelled = false
    const profile: cameraPicker.PickerProfile = {
      cameraPosition: camera.CameraPosition.CAMERA_POSITION_BACK
    }
    const result = await cameraPicker.pick(this.context, [cameraPicker.PickerMediaType.PHOTO], profile)
    if (this.cancelled || result.resultCode !== 0 || result.resultUri.length === 0) {
      throw new Error('CAMERA_CAPTURE_CANCELLED')
    }
    const source = image.createImageSource(result.resultUri)
    try {
      const info = await source.getImageInfo()
      return new CaptureResult(result.resultUri, info.size.width, info.size.height, 0, CaptureSource.CAMERA)
    } finally {
      await source.release()
    }
  }

  cancel(): void {
    this.cancelled = true
  }
}
