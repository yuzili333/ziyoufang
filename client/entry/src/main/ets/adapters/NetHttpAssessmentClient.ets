import http from '@ohos.net.http'
import { AssessmentTask, CharacterResult } from '../domain/AssessmentModels'
import { AssessmentClient, AssessmentProgress } from '../services/AssessmentClient'

export class AssessmentApiConfig {
  baseUrl: string
  submitPath: string
  resultsPath: string
  cancelPath: string
  feedbackPath: string
  connectTimeoutMs: number
  readTimeoutMs: number
  maxAttempts: number

  constructor(baseUrl: string, submitPath: string = '/v1/assessments',
    resultsPath: string = '/v1/assessments/{taskId}/results',
    cancelPath: string = '/v1/assessments/{taskId}/cancel',
    feedbackPath: string = '/v1/assessments/{taskId}/feedback',
    connectTimeoutMs: number = 15000, readTimeoutMs: number = 60000, maxAttempts: number = 3) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.submitPath = submitPath
    this.resultsPath = resultsPath
    this.cancelPath = cancelPath
    this.feedbackPath = feedbackPath
    this.connectTimeoutMs = connectTimeoutMs
    this.readTimeoutMs = readTimeoutMs
    this.maxAttempts = maxAttempts
  }

  url(path: string, taskId: string = ''): string {
    return `${this.baseUrl}${path.replace('{taskId}', encodeURIComponent(taskId))}`
  }
}

class SubmitResponse {
  taskId: string = ''
}

class ResultsResponse {
  results: CharacterResult[] = []
}

class FeedbackResponse {
  taskId: string = ''
}

export class AssessmentTransportError extends Error {
  retryable: boolean
  statusCode: number

  constructor(message: string, retryable: boolean, statusCode: number = 0) {
    super(message)
    this.retryable = retryable
    this.statusCode = statusCode
  }
}

export class NetHttpAssessmentClient implements AssessmentClient {
  private config: AssessmentApiConfig
  private activeRequests: Map<string, http.HttpRequest> = new Map()
  private cancelledLocalIds: Set<string> = new Set()
  private onProgress?: (progress: AssessmentProgress) => void

  constructor(config: AssessmentApiConfig, onProgress?: (progress: AssessmentProgress) => void) {
    this.config = config
    this.onProgress = onProgress
  }

  submit(task: AssessmentTask): Promise<string> {
    this.cancelledLocalIds.delete(task.localTaskId)
    return this.withRetry(() => {
      if (this.cancelledLocalIds.has(task.localTaskId)) {
        throw new AssessmentTransportError('ASSESSMENT_UPLOAD_CANCELLED', false)
      }
      return this.submitOnce(task)
    })
  }

  async fetchResults(remoteTaskId: string): Promise<CharacterResult[]> {
    return this.withRetry(async () => {
      const response = await this.requestJson(remoteTaskId,
        this.config.url(this.config.resultsPath, remoteTaskId), http.RequestMethod.GET)
      const data = JSON.parse(response) as ResultsResponse
      return data.results
    })
  }

  async cancel(remoteTaskId: string): Promise<void> {
    const active = this.activeRequests.get(remoteTaskId)
    if (active !== undefined) {
      active.destroy()
      this.activeRequests.delete(remoteTaskId)
    }
    await this.requestJson(remoteTaskId,
      this.config.url(this.config.cancelPath, remoteTaskId), http.RequestMethod.POST, '{}')
  }

  cancelUpload(localTaskId: string): void {
    this.cancelledLocalIds.add(localTaskId)
    const active = this.activeRequests.get(localTaskId)
    if (active !== undefined) {
      active.destroy()
      this.activeRequests.delete(localTaskId)
    }
  }

  retry(task: AssessmentTask): Promise<string> {
    return this.submit(task)
  }

  async submitFeedback(remoteTaskId: string, characterIndex: number, reason: string): Promise<string> {
    const payload = JSON.stringify({
      characterIndex: characterIndex,
      reason: reason
    })
    const response = await this.withRetry(() => this.requestJson(remoteTaskId,
      this.config.url(this.config.feedbackPath, remoteTaskId), http.RequestMethod.POST, payload))
    const data = JSON.parse(response) as FeedbackResponse
    return data.taskId
  }

  private async submitOnce(task: AssessmentTask): Promise<string> {
    const request = http.createHttp()
    this.activeRequests.set(task.localTaskId, request)
    request.on('dataSendProgress', (progress: http.DataSendProgressInfo) => {
      if (this.onProgress !== undefined) {
        this.onProgress(new AssessmentProgress(task.localTaskId, progress.sendSize, progress.totalSize))
      }
    })

    const metadata = JSON.stringify({
      localTaskId: task.localTaskId,
      studentId: task.studentId,
      expectedText: task.expectedText,
      createdAt: task.createdAt
    })
    const imagePath = task.imageUri.startsWith('file://') ? task.imageUri.substring(7) : task.imageUri
    const formData: http.MultiFormData[] = [
      {
        name: 'metadata',
        contentType: 'application/json; charset=utf-8',
        data: metadata
      },
      {
        name: 'image',
        contentType: 'image/jpeg',
        remoteFileName: `${task.localTaskId}.jpg`,
        filePath: imagePath
      }
    ]

    try {
      let response: http.HttpResponse
      try {
        response = await request.request(this.config.url(this.config.submitPath), {
          method: http.RequestMethod.POST,
          header: {
            'Accept': 'application/json',
            'Idempotency-Key': task.idempotencyKey,
            'X-Local-Task-Id': task.localTaskId
          },
          connectTimeout: this.config.connectTimeoutMs,
          readTimeout: this.config.readTimeoutMs,
          expectDataType: http.HttpDataType.STRING,
          multiFormDataList: formData
        })
      } catch (_error) {
        throw new AssessmentTransportError('ASSESSMENT_UPLOAD_FAILED', true)
      }
      this.assertSuccess(response.responseCode)
      const data = JSON.parse(`${response.result}`) as SubmitResponse
      if (data.taskId.length === 0) {
        throw new AssessmentTransportError('ASSESSMENT_TASK_ID_MISSING', false)
      }
      return data.taskId
    } finally {
      request.off('dataSendProgress')
      request.destroy()
      this.activeRequests.delete(task.localTaskId)
    }
  }

  private async requestJson(requestKey: string, url: string, method: http.RequestMethod,
    payload: string = ''): Promise<string> {
    const request = http.createHttp()
    this.activeRequests.set(requestKey, request)
    try {
      let response: http.HttpResponse
      try {
        response = await request.request(url, {
          method: method,
          header: {
            'Accept': 'application/json',
            'Content-Type': 'application/json; charset=utf-8'
          },
          extraData: payload,
          connectTimeout: this.config.connectTimeoutMs,
          readTimeout: this.config.readTimeoutMs,
          expectDataType: http.HttpDataType.STRING,
          usingCache: false
        })
      } catch (_error) {
        throw new AssessmentTransportError('ASSESSMENT_REQUEST_FAILED', true)
      }
      this.assertSuccess(response.responseCode)
      return `${response.result}`
    } finally {
      request.destroy()
      this.activeRequests.delete(requestKey)
    }
  }

  private assertSuccess(statusCode: number): void {
    if (statusCode >= 200 && statusCode < 300) {
      return
    }
    const retryable = statusCode === 408 || statusCode === 429 || statusCode >= 500
    throw new AssessmentTransportError(`ASSESSMENT_HTTP_${statusCode}`, retryable, statusCode)
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0
    while (attempt < this.config.maxAttempts) {
      attempt += 1
      try {
        return await operation()
      } catch (error) {
        const transportError = error as AssessmentTransportError
        if (attempt >= this.config.maxAttempts || transportError.retryable === false) {
          throw transportError
        }
        await this.delay(250 * attempt)
      }
    }
    throw new AssessmentTransportError('ASSESSMENT_RETRY_EXHAUSTED', false)
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve: () => void) => {
      setTimeout(resolve, milliseconds)
    })
  }
}
