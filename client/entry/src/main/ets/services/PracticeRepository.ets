import { AssessmentTask, CharacterResult } from '../domain/AssessmentModels'

export interface PracticeRepository {
  saveTask(task: AssessmentTask): Promise<void>
  findTask(localTaskId: string): Promise<AssessmentTask | undefined>
  listPendingTasks(): Promise<AssessmentTask[]>
  saveResults(localTaskId: string, results: CharacterResult[]): Promise<void>
  listProblemCharacters(studentId: string): Promise<CharacterResult[]>
}
