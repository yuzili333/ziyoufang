import { CharacterCategory, CharacterResult, CorrectionIssue } from '../domain/AssessmentModels'
import { GRID_BREAKPOINTS } from '../domain/Responsive'
import { AppTheme } from './Theme'

@Component
export struct ResultWorkspace {
  @Prop results: CharacterResult[]
  @Prop selectedIndex: number
  onSelected: (index: number) => void = () => {}

  private categoryLabel(category: CharacterCategory): string {
    if (category === CharacterCategory.WRONG) {
      return '错字'
    }
    if (category === CharacterCategory.UNATTRACTIVE) {
      return '需调整'
    }
    if (category === CharacterCategory.UNCERTAIN) {
      return '待确认'
    }
    return '正常'
  }

  private compactScoreLabel(result: CharacterResult): string {
    if (result.score === undefined) {
      return '--'
    }
    return result.score.toString()
  }

  private scoreLabel(result: CharacterResult): string {
    if (result.score === undefined) {
      return '待确认'
    }
    return result.score.toString() + ' 分'
  }

  @Builder
  CharacterList() {
    List({ space: 10 }) {
      ForEach(this.results, (item: CharacterResult, index: number) => {
        ListItem() {
          Column({ space: 4 }) {
            Text(item.expectedCharacter)
              .fontSize(28)
              .fontColor(AppTheme.INK)
            Text(this.categoryLabel(item.category))
              .fontSize(12)
              .fontColor(index === this.selectedIndex ? AppTheme.VERMILION : AppTheme.INK_SECONDARY)
            Text(this.compactScoreLabel(item))
              .fontSize(12)
              .fontColor(AppTheme.INK_SECONDARY)
          }
          .width(76)
          .height(88)
          .justifyContent(FlexAlign.Center)
          .backgroundColor(index === this.selectedIndex ? AppTheme.VERMILION_LIGHT : AppTheme.SURFACE)
          .border({
            width: index === this.selectedIndex ? 2 : 1,
            color: index === this.selectedIndex ? AppTheme.VERMILION : AppTheme.LINE
          })
          .borderRadius(12)
          .onClick(() => this.onSelected(index))
        }
      })
    }
    .listDirection(Axis.Horizontal)
    .width('100%')
    .height(96)
  }

  @Builder
  ComparisonView(result: CharacterResult) {
    Column({ space: 16 }) {
      Row({ space: 12 }) {
        Column({ space: 8 }) {
          Text('手写字')
            .fontSize(13)
            .fontColor(AppTheme.INK_SECONDARY)
          Text(result.recognizedCharacter)
            .fontSize(72)
            .fontColor(AppTheme.INK)
        }
        .layoutWeight(1)
        .height(150)
        .justifyContent(FlexAlign.Center)
        .backgroundColor(AppTheme.PAPER)
        .borderRadius(12)

        Column({ space: 8 }) {
          Text('标准宋体')
            .fontSize(13)
            .fontColor(AppTheme.INK_SECONDARY)
          Text(result.expectedCharacter)
            .fontSize(72)
            .fontColor(AppTheme.VERMILION)
        }
        .layoutWeight(1)
        .height(150)
        .justifyContent(FlexAlign.Center)
        .backgroundColor(AppTheme.PAPER)
        .borderRadius(12)
      }

      Column({ space: 10 }) {
        Row() {
          Text('问题清单')
            .fontSize(18)
            .fontWeight(FontWeight.Medium)
            .fontColor(AppTheme.INK)
          Blank()
          Text(this.scoreLabel(result))
            .fontSize(16)
            .fontColor(AppTheme.VERMILION)
        }
        .width('100%')

        if (result.issues.length === 0) {
          Text('本次未发现明显问题，继续保持。')
            .fontSize(15)
            .fontColor(AppTheme.SUCCESS)
            .width('100%')
        } else {
          ForEach(result.issues, (issue: CorrectionIssue) => {
            Column({ space: 4 }) {
              Text(issue.title)
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor(AppTheme.INK)
              Text(issue.description)
                .fontSize(14)
                .fontColor(AppTheme.INK_SECONDARY)
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
            .padding(12)
            .backgroundColor(AppTheme.PAPER)
            .borderRadius(10)
          })
        }

        Text('练习建议：' + result.suggestion)
          .fontSize(14)
          .fontColor(AppTheme.INK)
          .width('100%')
          .padding(12)
          .backgroundColor(AppTheme.VERMILION_LIGHT)
          .borderRadius(10)
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
  }

  build() {
    GridRow({
      breakpoints: {
        value: GRID_BREAKPOINTS,
        reference: BreakpointsReference.WindowSize
      },
      columns: { sm: 4, md: 8, lg: 12 },
      gutter: { x: 16, y: 12 }
    }) {
      GridCol({ span: { sm: 4, md: 8, lg: 12 } }) {
        this.CharacterList()
      }
      GridCol({ span: { sm: 4, md: 8, lg: 12 } }) {
        if (this.results.length > 0) {
          this.ComparisonView(this.results[this.selectedIndex])
        }
      }
    }
    .width('100%')
  }
}
