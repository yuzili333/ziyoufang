import type { AssessmentTask, CharacterResult } from '../../domain/types'
import { AssessmentClient } from '../../services/assessment-client'
import { TaskMediaStore } from '../../services/task-media-store'

const emptyCrop = () => ({
  localMediaPath: '',
  localCropAvailable: false,
  cropImageStyle: ''
})

const normalizeCharacter = (character: CharacterResult): CharacterResult => ({
  ...character,
  differenceAnnotations: character.differenceAnnotations ?? []
})

const normalizeTask = (task: AssessmentTask): AssessmentTask => ({
  ...task,
  characters: task.characters?.map(normalizeCharacter)
})

const cropPresentation = (selected: CharacterResult | null, taskId: string) => {
  const media = TaskMediaStore.get(taskId)
  const polygon = selected?.polygon
  if (!media || !polygon || polygon.length < 4) return emptyCrop()

  const xs = polygon.map((point) => point.x)
  const ys = polygon.map((point) => point.y)
  if (![...xs, ...ys].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) return emptyCrop()

  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const width = Math.max(...xs) - left
  const height = Math.max(...ys) - top
  if (width <= 0 || height <= 0) return emptyCrop()

  return {
    localMediaPath: media.savedFilePath,
    localCropAvailable: true,
    cropImageStyle: [
      `width:${(100 / width).toFixed(3)}%`,
      `left:${(-left / width * 100).toFixed(3)}%`,
      `top:${(-top / height * 100).toFixed(3)}%`
    ].join(';')
  }
}

Page({
  data: {
    taskId: '',
    loading: true,
    task: null as AssessmentTask | null,
    selected: null as CharacterResult | null,
    issueTexts: [] as string[],
    selectedIndex: 0,
    mode: 'overlay',
    ...emptyCrop()
  },
  onLoad(query: Record<string, string>) {
    this.setData({ taskId: query.taskId ?? '' })
    this.loadResult()
  },
  async onPullDownRefresh() { await this.loadResult(); wx.stopPullDownRefresh() },
  async loadResult() {
    try {
      const task = normalizeTask(await AssessmentClient.getAssessment(this.data.taskId))
      const selected = task.characters?.[this.data.selectedIndex] ?? null
      this.setData({
        task,
        selected,
        issueTexts: this.issueTexts(selected),
        ...cropPresentation(selected, task.taskId),
        loading: false
      })
    } catch {
      this.setData({ loading: false })
      wx.showToast({ title: '结果加载失败', icon: 'none' })
    }
  },
  selectCharacter(event: WechatMiniprogram.CustomEvent<{ index: number }>) {
    const index = Number(event.currentTarget?.dataset?.index ?? event.detail.index)
    const selected = this.data.task?.characters?.[index] ?? null
    this.setData({
      selectedIndex: index,
      selected,
      issueTexts: this.issueTexts(selected),
      ...cropPresentation(selected, this.data.taskId)
    })
  },
  issueTexts(selected: CharacterResult | null) {
    return selected?.issues.map((issue) => typeof issue === 'string' ? issue : `${issue.title}：${issue.detail}`) ?? []
  },
  viewGrowth() {
    if (!this.data.selected) return
    wx.navigateTo({ url: `/pages/growth/index?character=${encodeURIComponent(this.data.selected.expectedCharacter)}` })
  },
  reportIssue() {
    if (!this.data.selected) return
    const character = encodeURIComponent(this.data.selected.expectedCharacter)
    wx.navigateTo({
      url: `/pages/feedback/index?taskId=${encodeURIComponent(this.data.taskId)}&characterIndex=${this.data.selected.index}&character=${character}`
    })
  },
  shareResult() {
    wx.navigateTo({ url: `/pages/share-confirm/index?taskId=${encodeURIComponent(this.data.taskId)}` })
  },
  deletePractice() {
    wx.navigateTo({ url: `/pages/delete-practice/index?taskId=${encodeURIComponent(this.data.taskId)}` })
  },
  onLocalMediaError() {
    this.setData(emptyCrop())
  },
  capture() {
    wx.reLaunch({ url: '/pages/practice/index?capture=1' })
  },
  setOverlay() { this.setData({ mode: 'overlay' }) },
  setParallel() { this.setData({ mode: 'parallel' }) }
})
