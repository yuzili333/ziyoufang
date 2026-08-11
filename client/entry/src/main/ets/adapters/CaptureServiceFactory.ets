import common from '@ohos.app.ability.common'
import deviceInfo from '@ohos.deviceInfo'
import { CaptureService } from '../services/CaptureService'
import { ArkUiXCaptureService } from './ArkUiXCaptureService'
import { ArkUiXNativeCameraBridge } from './ArkUiXNativeCameraBridge'
import { HarmonyCameraBridge } from './HarmonyCameraBridge'

export function createCaptureService(context: common.UIAbilityContext): CaptureService {
  const platform = deviceInfo.osFullName.split(' ')[0]
  if (platform === 'Android' || platform === 'iOS') {
    return new ArkUiXCaptureService(new ArkUiXNativeCameraBridge())
  }
  return new ArkUiXCaptureService(new HarmonyCameraBridge(context))
}
