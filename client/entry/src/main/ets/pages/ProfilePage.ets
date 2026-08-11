import { AppTheme } from '../components/Theme'

@Component
export struct ProfilePage {
  build() {
    Column({ space: 18 }) {
      Row({ space: 12 }) {
        Image($r('app.media.icon'))
          .width(48)
          .height(48)
          .borderRadius(12)
        Column({ space: 4 }) {
          Text('我的')
            .fontSize(24)
            .fontWeight(FontWeight.Bold)
            .fontColor(AppTheme.INK)
          Text('本地练习数据')
            .fontSize(13)
            .fontColor(AppTheme.INK_SECONDARY)
        }
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')

      Column() {
        Row() {
          Column({ space: 4 }) {
            Text('字本')
              .fontSize(17)
              .fontWeight(FontWeight.Medium)
              .fontColor(AppTheme.INK)
            Text('错字、不美观字与历次矫正')
              .fontSize(13)
              .fontColor(AppTheme.INK_SECONDARY)
          }
          .alignItems(HorizontalAlign.Start)
          Blank()
          Text('进入')
            .fontSize(14)
            .fontColor(AppTheme.VERMILION)
        }
        .padding(16)
        .width('100%')
      }
      .backgroundColor(AppTheme.SURFACE)
      .borderRadius(14)
      .border({ width: 1, color: AppTheme.LINE })

      Text('数据仅保存在本机；联网评测时按授权提交必要图片。')
        .fontSize(13)
        .fontColor(AppTheme.INK_SECONDARY)
        .width('100%')
    }
    .padding({ left: 18, right: 18, top: 18, bottom: 100 })
    .width('100%')
    .height('100%')
    .alignItems(HorizontalAlign.Start)
    .backgroundColor(AppTheme.PAPER)
  }
}
