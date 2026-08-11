import { ProviderError } from '../providers/provider-error.mjs'
import { rgbaLuminance } from './png-rgba.mjs'

const round = (value, digits = 2) => Number(value.toFixed(digits))

export class DeterministicImageQualityAnalyzer {
  constructor({
    version = 'quality-laplacian-synthetic-v1',
    expectedAspectRatio = 1,
    aspectRatioTolerance = 0.12,
    minimumLaplacianVariance = 100,
    minimumMeanLuminance = 45,
    maximumMeanLuminance = 250,
    sampleStep = 4
  } = {}) {
    this.version = version
    this.expectedAspectRatio = expectedAspectRatio
    this.aspectRatioTolerance = aspectRatioTolerance
    this.minimumLaplacianVariance = minimumLaplacianVariance
    this.minimumMeanLuminance = minimumMeanLuminance
    this.maximumMeanLuminance = maximumMeanLuminance
    this.sampleStep = sampleStep
  }

  inspect(image) {
    if (!image?.data || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.channels !== 4) {
      throw new ProviderError('IMAGE_FORMAT_UNSUPPORTED')
    }
    const aspectRatio = image.width / image.height
    const aspectRatioDeviation = Math.abs(aspectRatio - this.expectedAspectRatio) / this.expectedAspectRatio
    const luminanceAt = (x, y) => rgbaLuminance(image.data, (y * image.width + x) * 4)
    let count = 0
    let luminanceSum = 0
    let laplacianSum = 0
    let laplacianSquaredSum = 0
    const distance = 2
    for (let y = distance; y < image.height - distance; y += this.sampleStep) {
      for (let x = distance; x < image.width - distance; x += this.sampleStep) {
        const center = luminanceAt(x, y)
        const laplacian = 4 * center
          - luminanceAt(x - distance, y)
          - luminanceAt(x + distance, y)
          - luminanceAt(x, y - distance)
          - luminanceAt(x, y + distance)
        count += 1
        luminanceSum += center
        laplacianSum += laplacian
        laplacianSquaredSum += laplacian ** 2
      }
    }
    if (count === 0) throw new ProviderError('IMAGE_TOO_SMALL')
    const meanLuminance = luminanceSum / count
    const laplacianMean = laplacianSum / count
    const laplacianVariance = laplacianSquaredSum / count - laplacianMean ** 2
    const metrics = {
      width: image.width,
      height: image.height,
      aspectRatio: round(aspectRatio, 4),
      aspectRatioDeviation: round(aspectRatioDeviation, 4),
      meanLuminance: round(meanLuminance),
      laplacianVariance: round(laplacianVariance)
    }
    let reason = null
    if (aspectRatioDeviation > this.aspectRatioTolerance) reason = 'GRID_INCOMPLETE'
    else if (meanLuminance < this.minimumMeanLuminance) reason = 'IMAGE_TOO_DARK'
    else if (meanLuminance > this.maximumMeanLuminance) reason = 'IMAGE_OVEREXPOSED'
    else if (laplacianVariance < this.minimumLaplacianVariance) reason = 'IMAGE_BLUR'
    return { accepted: reason === null, reason, metrics, qualityVersion: this.version }
  }
}
