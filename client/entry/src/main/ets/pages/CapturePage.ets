import { AppTheme } from '../components/Theme'
import { CaptureResult, CaptureService } from '../services/CaptureService'

@Component
export struct CapturePage {
  onClose: () => void = () => {}
  onCaptured: (result: CaptureResult) => void = (_result: CaptureResult) => {}
  captureService?: CaptureService
  @State busy: boolean = false
  @State errorMessage: string = ''
  @State previewUri: string = ''
  private pendingResult?: CaptureResult

  private close(): void {
    if (this.busy && this.captureService !== undefined) {
      this.captureService.cancel()
    }
    this.onClose()
  }

  private showPreview(result: CaptureResult): void {
    this.pendingResult = result
    this.previewUri = result.uri
  }

  private usePhoto(): void {
    if (this.pendingResult !== undefined) {
      this.onCaptured(this.pendingResult)
    }
  }

  private retake(): void {
    this.pendingResult = undefined
    this.previewUri = ''
    this.capture()
  }

  private async capture(): Promise<void> {
    if (this.captureService === undefined || this.busy) {
      return
    }
    this.busy = true
    this.errorMessage = ''
    try {
      const granted = await this.captureService.requestCameraPermission()
      if (!granted) {
        this.errorMessage = '未获得相机权限，请在系统设置中允许访问。'
        return
      }
      this.showPreview(await this.captureService.capture())
    } catch (error) {
      if (`${error}`.includes('CANCELLED')) {
        return
      }
      this.errorMessage = '拍摄未完成，请稍后重试。'
    } finally {
      this.busy = false
    }
  }

  private async pickFromLibrary(): Promise<void> {
    if (this.captureService === undefined || this.busy) {
      return
    }
    this.busy = true
    this.errorMessage = ''
    try {
      this.showPreview(await this.captureService.pickFromLibrary())
    } catch (error) {
      if (!`${error}`.includes('CANCELLED')) {
        this.errorMessage = '照片读取失败，请重新选择。'
      }
    } finally {
      this.busy = false
    }
  }

  build() {
    Column({ space: 18 }) {
      Row() {
        Button('取消')
          .fontColor(AppTheme.INK)
          .backgroundColor(Color.Transparent)
          .onClick(() => this.close())
        Blank()
        Text('拍摄练字本')
          .fontSize(18)
          .fontWeight(FontWeight.Medium)
          .fontColor(AppTheme.INK)
        Blank()
        Button('相册')
          .fontColor(AppTheme.VERMILION)
          .backgroundColor(Color.Transparent)
          .onClick(() => this.pickFromLibrary())
      }
      .width('100%')

      Stack() {
        if (this.previewUri.length > 0) {
          Image(this.previewUri)
            .width('100%')
            .height('100%')
            .objectFit(ImageFit.Contain)
        } else {
          Column() {
            Divider().color('#9B958B').strokeWidth(1)
            Blank()
            Divider().color('#9B958B').strokeWidth(1)
            Blank()
            Divider().color('#9B958B').strokeWidth(1)
          }
          .height('100%')
          Row() {
            Divider().vertical(true).color('#9B958B').strokeWidth(1)
            Blank()
            Divider().vertical(true).color('#9B958B').strokeWidth(1)
            Blank()
            Divider().vertical(true).color('#9B958B').strokeWidth(1)
          }
          .width('100%')
        }
      }
      .layoutWeight(1)
      .width('100%')
      .backgroundColor('#EEEAE2')
      .border({ width: 2, color: AppTheme.VERMILION })
      .borderRadius(16)

      Text(this.previewUri.length > 0 ? '请检查整页方格是否清晰完整。' :
        '将整页方格置于红框内，保持页面平整、光线均匀。')
        .fontSize(14)
        .fontColor(AppTheme.INK_SECONDARY)
        .textAlign(TextAlign.Center)

      if (this.errorMessage.length > 0) {
        Text(this.errorMessage)
          .fontSize(13)
          .fontColor(AppTheme.VERMILION)
          .textAlign(TextAlign.Center)
      }

      if (this.previewUri.length > 0) {
        Row({ space: 12 }) {
          Button('重新拍摄')
            .fontColor(AppTheme.VERMILION)
            .backgroundColor(AppTheme.SURFACE)
            .border({ width: 1, color: AppTheme.VERMILION })
            .layoutWeight(1)
            .height(52)
            .onClick(() => this.retake())
          Button('使用照片')
            .fontColor(Color.White)
            .backgroundColor(AppTheme.VERMILION)
            .layoutWeight(1)
            .height(52)
            .onClick(() => this.usePhoto())
        }
        .width('100%')
      } else {
        Button(this.busy ? '处理中…' : '拍照')
          .fontSize(17)
          .fontColor(Color.White)
          .backgroundColor(AppTheme.VERMILION)
          .width(86)
          .height(54)
          .borderRadius(27)
          .enabled(!this.busy && this.captureService !== undefined)
          .onClick(() => this.capture())
      }
    }
    .padding({ left: 18, right: 18, top: 14, bottom: 30 })
    .width('100%')
    .height('100%')
    .backgroundColor(AppTheme.PAPER)
  }
}
