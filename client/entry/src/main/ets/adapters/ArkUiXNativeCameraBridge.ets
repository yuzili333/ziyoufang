import bridge from '@arkui-x.bridge'
import { CaptureResult, CaptureSource } from '../services/CaptureService'
import { PlatformCameraBridge } from './PlatformCameraBridge'

class NativeCameraEvent {
  type: string = ''
  granted: boolean = false
  status: string = ''
  uri: string = ''
  width: number = 0
  height: number = 0
  orientation: number = 0
  errorCode: string = ''
}

/**
 * JSON bridge shared by the Android CameraX and iOS AVFoundation hosts.
 * HarmonyOS uses a Camera Kit implementation behind the same interface.
 */
export class ArkUiXNativeCameraBridge implements PlatformCameraBridge {
  private nativeBridge: bridge.BridgeObject
  private permissionResolve?: (granted: boolean) => void
  private captureResolve?: (result: CaptureResult) => void
  private captureReject?: (reason: Error) => void

  constructor() {
    this.nativeBridge = bridge.createBridge('ZiYouFangCamera')
    this.nativeBridge.setMessageListener((message: bridge.Message): bridge.Response => {
      this.handleNativeEvent(`${message}`)
      return 'received'
    })
  }

  async requestPermission(): Promise<boolean> {
    const pendingPermission = new Promise((resolve: (granted: boolean) => void) => {
      this.permissionResolve = resolve
    })
    let result: bridge.ResultValue
    try {
      result = await this.nativeBridge.callMethod('requestCameraPermission', '{}')
    } catch (error) {
      this.permissionResolve = undefined
      throw new Error(`CAMERA_PERMISSION_REQUEST_FAILED: ${error}`)
    }
    if (`${result}` === 'granted') {
      this.permissionResolve = undefined
      return true
    }
    if (`${result}` !== 'pending') {
      this.permissionResolve = undefined
      return false
    }
    return pendingPermission
  }

  async capture(): Promise<CaptureResult> {
    if (this.captureReject !== undefined) {
      throw new Error('CAMERA_CAPTURE_ALREADY_ACTIVE')
    }
    const pendingCapture = new Promise((resolve: (result: CaptureResult) => void,
      reject: (reason: Error) => void) => {
      this.captureResolve = resolve
      this.captureReject = reject
    })
    try {
      const startResult = await this.nativeBridge.callMethod('startCapture', '{}')
      if (`${startResult}` !== 'started') {
        this.rejectCapture('CAMERA_CAPTURE_START_FAILED')
      }
    } catch (error) {
      this.rejectCapture('CAMERA_BRIDGE_UNAVAILABLE')
    }
    return pendingCapture
  }

  cancel(): void {
    this.nativeBridge.callMethod('cancelCapture', '{}')
    this.rejectCapture('CAMERA_CAPTURE_CANCELLED')
  }

  private handleNativeEvent(json: string): void {
    const event = JSON.parse(json) as NativeCameraEvent
    if (event.type === 'permission') {
      if (this.permissionResolve !== undefined) {
        this.permissionResolve(event.granted)
        this.permissionResolve = undefined
      }
      return
    }
    if (event.type !== 'capture') {
      return
    }
    if (event.status === 'success' && this.captureResolve !== undefined) {
      this.captureResolve(new CaptureResult(event.uri, event.width, event.height,
        event.orientation, CaptureSource.CAMERA))
      this.clearCaptureCallbacks()
      return
    }
    this.rejectCapture(event.status === 'cancelled' ? 'CAMERA_CAPTURE_CANCELLED' :
      (event.errorCode.length > 0 ? event.errorCode : 'CAMERA_CAPTURE_FAILED'))
  }

  private rejectCapture(errorCode: string): void {
    if (this.captureReject !== undefined) {
      this.captureReject(new Error(errorCode))
    }
    this.clearCaptureCallbacks()
  }

  private clearCaptureCallbacks(): void {
    this.captureResolve = undefined
    this.captureReject = undefined
  }
}
