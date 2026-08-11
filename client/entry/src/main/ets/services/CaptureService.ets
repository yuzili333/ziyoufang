export enum CaptureSource {
  CAMERA = 'camera',
  PHOTO_LIBRARY = 'photo_library'
}

export class CaptureResult {
  uri: string
  width: number
  height: number
  orientation: number
  source: CaptureSource

  constructor(uri: string, width: number, height: number, orientation: number, source: CaptureSource) {
    this.uri = uri
    this.width = width
    this.height = height
    this.orientation = orientation
    this.source = source
  }
}

export interface CaptureService {
  requestCameraPermission(): Promise<boolean>
  capture(): Promise<CaptureResult>
  pickFromLibrary(): Promise<CaptureResult>
  cancel(): void
}
