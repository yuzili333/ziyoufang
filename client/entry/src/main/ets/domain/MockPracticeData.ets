import { BoundingBox, CharacterCategory, CharacterResult, CorrectionIssue } from './AssessmentModels'

const issueOne: CorrectionIssue = new CorrectionIssue(
  'issue-001',
  '横画位置偏高',
  '上方横画与中线距离过小，下一次练习时留出更多空间。',
  new BoundingBox(0.18, 0.12, 0.62, 0.18)
)

const issueTwo: CorrectionIssue = new CorrectionIssue(
  'issue-002',
  '左右结构失衡',
  '左部偏宽、右部偏窄，建议先确定中线再落笔。',
  new BoundingBox(0.08, 0.18, 0.84, 0.66)
)

const uncertainIssue: CorrectionIssue = new CorrectionIssue(
  'issue-003',
  '识别证据不足',
  '当前图片证据不足，请确认目标内容或重新拍摄。',
  new BoundingBox(0.76, 0.31, 0.18, 0.18)
)

export const SAMPLE_CHARACTER_RESULTS: CharacterResult[] = [
  new CharacterResult(0, '永', '永', '', 'songti-v1', 86, 0.96,
    CharacterCategory.UNATTRACTIVE, new BoundingBox(0.0725, 0.0725, 0.18, 0.18), [issueOne],
    '先写稳中心点，再控制横画与竖钩的间距。'),
  new CharacterResult(1, '和', '和', '', 'songti-v1', 74, 0.94,
    CharacterCategory.UNATTRACTIVE, new BoundingBox(0.2975, 0.0725, 0.18, 0.18), [issueTwo],
    '先用中线划分左右比例，再保持“口”部收紧。'),
  new CharacterResult(2, '春', '春', '', 'songti-v1', 91, 0.97,
    CharacterCategory.NORMAL, new BoundingBox(0.5225, 0.0725, 0.18, 0.18), [],
    '整体结构稳定，继续保持横画间距。'),
  new CharacterResult(3, '山', '出', '', 'songti-v1', 42, 0.92,
    CharacterCategory.WRONG, new BoundingBox(0.7475, 0.0725, 0.18, 0.18), [issueTwo],
    '当前字形多出下方结构，请对照“山”的三竖位置重新练习。'),
  new CharacterResult(4, '日', '日', '', 'songti-v1', 90, 0.97,
    CharacterCategory.NORMAL, new BoundingBox(0.0725, 0.2975, 0.18, 0.18), [],
    '外框稳定，继续保持内部横画居中。'),
  new CharacterResult(5, '月', '月', '', 'songti-v1', 76, 0.95,
    CharacterCategory.UNATTRACTIVE, new BoundingBox(0.2975, 0.2975, 0.18, 0.18), [issueOne],
    '注意内部横画间距，竖钩不要外张。'),
  new CharacterResult(6, '天', '天', '', 'songti-v1', 94, 0.98,
    CharacterCategory.NORMAL, new BoundingBox(0.5225, 0.2975, 0.18, 0.18), [],
    '上下比例协调，继续保持。'),
  new CharacterResult(7, '地', '地', '', 'songti-v1', undefined, 0.43,
    CharacterCategory.UNCERTAIN, new BoundingBox(0.7475, 0.2975, 0.18, 0.18), [uncertainIssue],
    '请确认目标内容或重新拍摄更清晰的图片。'),
  new CharacterResult(8, '人', '人', '', 'songti-v1', 92, 0.98,
    CharacterCategory.NORMAL, new BoundingBox(0.0725, 0.5225, 0.18, 0.18), [],
    '撇捺舒展，重心稳定。'),
  new CharacterResult(9, '心', '心', '', 'songti-v1', 79, 0.94,
    CharacterCategory.UNATTRACTIVE, new BoundingBox(0.2975, 0.5225, 0.18, 0.18), [issueTwo],
    '控制三点呼应关系，卧钩保持平稳。'),
  new CharacterResult(10, '正', '正', '', 'songti-v1', 95, 0.98,
    CharacterCategory.NORMAL, new BoundingBox(0.5225, 0.5225, 0.18, 0.18), [],
    '横竖关系清楚，继续保持。'),
  new CharacterResult(11, '学', '学', '', 'songti-v1', 89, 0.97,
    CharacterCategory.NORMAL, new BoundingBox(0.7475, 0.5225, 0.18, 0.18), [],
    '上下结构完整，重心稳定。'),
  new CharacterResult(12, '书', '书', '', 'songti-v1', 73, 0.93,
    CharacterCategory.UNATTRACTIVE, new BoundingBox(0.0725, 0.7475, 0.18, 0.18), [issueOne],
    '横折与竖钩衔接偏紧，注意留白。'),
  new CharacterResult(13, '法', '法', '', 'songti-v1', 92, 0.97,
    CharacterCategory.NORMAL, new BoundingBox(0.2975, 0.7475, 0.18, 0.18), [],
    '左右比例协调，继续保持。'),
  new CharacterResult(14, '美', '美', '', 'songti-v1', 90, 0.96,
    CharacterCategory.NORMAL, new BoundingBox(0.5225, 0.7475, 0.18, 0.18), [],
    '中轴清晰，上下结构稳定。'),
  new CharacterResult(15, '华', '华', '', 'songti-v1', 88, 0.96,
    CharacterCategory.NORMAL, new BoundingBox(0.7475, 0.7475, 0.18, 0.18), [],
    '各部分间距均衡，继续保持。')
]
