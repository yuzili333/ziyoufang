import { ResultWorkspace } from '../components/ResultWorkspace'
import { AppTheme } from '../components/Theme'
import { SAMPLE_CHARACTER_RESULTS } from '../domain/MockPracticeData'

@Component
export struct PracticePage {
  @State selectedIndex: number = 0

  build() {
    Scroll() {
      Column({ space: 18 }) {
        Row({ space: 10 }) {
          Image($r('app.media.icon'))
            .width(38)
            .height(38)
            .borderRadius(9)
          Column({ space: 2 }) {
            Text('字有方')
              .fontSize(22)
              .fontWeight(FontWeight.Bold)
              .fontColor(AppTheme.INK)
            Text('汉字有形，习字有方。')
              .fontSize(12)
              .fontColor(AppTheme.INK_SECONDARY)
          }
          .alignItems(HorizontalAlign.Start)
          Blank()
          Text('已识别 ' + SAMPLE_CHARACTER_RESULTS.length.toString() + ' 字')
            .fontSize(13)
            .fontColor(AppTheme.VERMILION)
        }
        .width('100%')

        Column({ space: 6 }) {
          Text('本次练习结果')
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .fontColor(AppTheme.INK)
          Text('左右滑动浏览识字结果，点选单字查看对比和纠错建议。')
            .fontSize(14)
            .fontColor(AppTheme.INK_SECONDARY)
        }
        .alignItems(HorizontalAlign.Start)
        .width('100%')

        ResultWorkspace({
          results: SAMPLE_CHARACTER_RESULTS,
          selectedIndex: this.selectedIndex,
          onSelected: (index: number) => {
            this.selectedIndex = index
          }
        })

        Button('结果有误，申请重新评测')
          .fontSize(14)
          .fontColor(AppTheme.VERMILION)
          .backgroundColor(Color.Transparent)
          .border({ width: 1, color: AppTheme.VERMILION })
          .height(44)
          .width('100%')
      }
      .padding({ left: 18, right: 18, top: 16, bottom: 108 })
      .width('100%')
    }
    .scrollBar(BarState.Off)
    .backgroundColor(AppTheme.PAPER)
  }
}
