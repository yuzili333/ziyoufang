import { CaptureResult } from '../services/CaptureService'

/**
 * Native camera boundary. Android, iOS and HarmonyOS hosts implement this
 * interface; shared pages never depend on platform camera APIs directly.
 */
export interface PlatformCameraBridge {
  requestPermission(): Promise<boolean>
  capture(): Promise<CaptureResult>
  cancel(): void
}
