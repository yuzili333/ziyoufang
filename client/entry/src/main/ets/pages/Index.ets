import { AppTheme } from '../components/Theme'
import common from '@ohos.app.ability.common'
import { createCaptureService } from '../adapters/CaptureServiceFactory'
import { CaptureService } from '../services/CaptureService'
import { CapturePage } from './CapturePage'
import { PracticePage } from './PracticePage'
import { ProfilePage } from './ProfilePage'

@Entry
@Component
struct Index {
  @State currentTab: number = 0
  @State showCapture: boolean = false
  private captureService?: CaptureService

  aboutToAppear(): void {
    const hostContext = this.getUIContext().getHostContext()
    if (hostContext !== undefined) {
      this.captureService = createCaptureService(hostContext as common.UIAbilityContext)
    }
  }

  @Builder
  BottomNavigation() {
    Row() {
      Button('练习')
        .layoutWeight(1)
        .height(58)
        .fontColor(this.currentTab === 0 ? AppTheme.VERMILION : AppTheme.INK_SECONDARY)
        .backgroundColor(Color.Transparent)
        .onClick(() => {
          this.currentTab = 0
        })

      Button('拍照上传')
        .width(108)
        .height(58)
        .fontSize(15)
        .fontColor(Color.White)
        .backgroundColor(AppTheme.VERMILION)
        .borderRadius(29)
        .onClick(() => {
          this.showCapture = true
        })

      Button('我的')
        .layoutWeight(1)
        .height(58)
        .fontColor(this.currentTab === 2 ? AppTheme.VERMILION : AppTheme.INK_SECONDARY)
        .backgroundColor(Color.Transparent)
        .onClick(() => {
          this.currentTab = 2
        })
    }
    .width('100%')
    .height(76)
    .padding({ left: 10, right: 10, top: 8, bottom: 10 })
    .backgroundColor(AppTheme.SURFACE)
    .border({ width: { top: 1 }, color: AppTheme.LINE })
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      if (this.showCapture) {
        CapturePage({
          captureService: this.captureService,
          onClose: () => {
            this.showCapture = false
          },
          onCaptured: () => {
            this.showCapture = false
          }
        })
      } else {
        Column() {
          if (this.currentTab === 0) {
            PracticePage()
          } else {
            ProfilePage()
          }
        }
        .width('100%')
        .height('100%')

        this.BottomNavigation()
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(AppTheme.PAPER)
  }
}
