import { AssessmentTask, CharacterResult } from '../domain/AssessmentModels'

export class AssessmentProgress {
  taskId: string
  uploadedBytes: number
  totalBytes: number

  constructor(taskId: string, uploadedBytes: number, totalBytes: number) {
    this.taskId = taskId
    this.uploadedBytes = uploadedBytes
    this.totalBytes = totalBytes
  }
}

export interface AssessmentClient {
  submit(task: AssessmentTask): Promise<string>
  fetchResults(remoteTaskId: string): Promise<CharacterResult[]>
  cancelUpload(localTaskId: string): void
  cancel(remoteTaskId: string): Promise<void>
  retry(task: AssessmentTask): Promise<string>
  submitFeedback(remoteTaskId: string, characterIndex: number, reason: string): Promise<string>
}
