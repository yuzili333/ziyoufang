export interface FailureGuidance {
  title: string
  message: string
  action: 'retry' | 'retake'
}

const QUALITY_GUIDANCE: Record<string, FailureGuidance> = {
  IMAGE_BLUR: {
    title: '照片有些模糊',
    message: '请保持手机稳定、对焦清楚后重新拍摄。',
    action: 'retake'
  },
  GRID_INCOMPLETE: {
    title: '方格没有拍完整',
    message: '请把整页练字本和四周方格都放进画面。',
    action: 'retake'
  },
  IMAGE_TOO_DARK: {
    title: '照片光线太暗',
    message: '请移到光线均匀的地方，避免手或手机遮挡光线。',
    action: 'retake'
  },
  IMAGE_OVEREXPOSED: {
    title: '照片亮得看不清',
    message: '请避开强光和反光，调整角度后重新拍摄。',
    action: 'retake'
  },
  TARGET_TEXT_EXCEEDS_GRID: {
    title: '目标文字与方格数量不一致',
    message: '请返回练习页核对目标文字，并重新拍摄完整页面。',
    action: 'retake'
  },
  IMAGE_FORMAT_UNSUPPORTED: {
    title: '图片格式暂不支持',
    message: '请重新拍摄，或从相册选择 JPG、JPEG、PNG 图片。',
    action: 'retake'
  },
  IMAGE_DECODE_FAILED: {
    title: '图片文件无法读取',
    message: '图片可能已经损坏，请重新拍摄或选择另一张照片。',
    action: 'retake'
  },
  IMAGE_INPUT_EMPTY: {
    title: '没有读取到图片内容',
    message: '请重新拍摄或从相册选择一张完整照片。',
    action: 'retake'
  },
  IMAGE_FILE_TOO_LARGE: {
    title: '图片文件过大',
    message: '请选择不超过 15MB 的图片，或降低相机分辨率后重拍。',
    action: 'retake'
  },
  IMAGE_PIXEL_LIMIT_EXCEEDED: {
    title: '图片分辨率过高',
    message: '请降低相机分辨率后重新拍摄，单张图片不能超过 2000 万像素。',
    action: 'retake'
  },
  MEDIA_DIGEST_MISMATCH: {
    title: '图片完整性校验失败',
    message: '上传内容可能不完整，请重新拍摄或选择原照片后再次提交。',
    action: 'retake'
  },
  MEDIA_HOST_FORBIDDEN: {
    title: '服务暂时不能读取照片',
    message: '照片仍已安全保存，请稍后使用同一任务重试。',
    action: 'retry'
  },
  MEDIA_ACCESS_INVALID: {
    title: '照片访问授权暂时不可用',
    message: '照片仍已安全保存，请稍后使用同一任务重试。',
    action: 'retry'
  }
}

export function failureGuidance(errorCode?: string | null, retryable = true): FailureGuidance {
  if (errorCode && QUALITY_GUIDANCE[errorCode]) return QUALITY_GUIDANCE[errorCode]
  if (!retryable) {
    return {
      title: '这张照片暂时不能分析',
      message: '请按拍摄提示换一张更清楚、完整的照片。',
      action: 'retake'
    }
  }
  return {
    title: '本次分析没有完成',
    message: '上传检查点已保留，可以使用同一任务安全重试。',
    action: 'retry'
  }
}
