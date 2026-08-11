import relationalStore from '@ohos.data.relationalStore'
import common from '@ohos.app.ability.common'
import {
  AssessmentTask,
  AssessmentTaskStatus,
  CharacterCategory,
  CharacterResult
} from '../domain/AssessmentModels'
import { PracticeRepository } from '../services/PracticeRepository'

const TABLE_TASK: string = 'practice_task'
const DATABASE_VERSION: number = 1
const CREATE_TASK_TABLE: string = `CREATE TABLE IF NOT EXISTS ${TABLE_TASK} (` +
  'local_task_id TEXT PRIMARY KEY, ' +
  'idempotency_key TEXT UNIQUE NOT NULL, ' +
  'student_id TEXT NOT NULL, ' +
  'image_uri TEXT NOT NULL, ' +
  'expected_text TEXT NOT NULL, ' +
  'status TEXT NOT NULL, ' +
  'retry_count INTEGER NOT NULL, ' +
  'created_at INTEGER NOT NULL, ' +
  "results_json TEXT NOT NULL DEFAULT '[]')"

export class RdbPracticeRepository implements PracticeRepository {
  private context: common.UIAbilityContext
  private store?: relationalStore.RdbStore

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  async saveTask(task: AssessmentTask): Promise<void> {
    try {
      const store = await this.getStore()
      const values: relationalStore.ValuesBucket = {
        local_task_id: task.localTaskId,
        idempotency_key: task.idempotencyKey,
        student_id: task.studentId,
        image_uri: task.imageUri,
        expected_text: task.expectedText,
        status: task.status,
        retry_count: task.retryCount,
        created_at: task.createdAt,
        results_json: JSON.stringify(task.results)
      }
      await store.insert(TABLE_TASK, values, relationalStore.ConflictResolution.ON_CONFLICT_REPLACE)
    } catch (error) {
      throw new Error(`PRACTICE_TASK_SAVE_FAILED: ${error}`)
    }
  }

  async findTask(localTaskId: string): Promise<AssessmentTask | undefined> {
    let resultSet: relationalStore.ResultSet | undefined
    try {
      const store = await this.getStore()
      const predicates = new relationalStore.RdbPredicates(TABLE_TASK)
      predicates.equalTo('local_task_id', localTaskId)
      resultSet = await store.query(predicates)
      if (!resultSet.goToFirstRow()) {
        return undefined
      }
      return this.readTask(resultSet)
    } catch (error) {
      throw new Error(`PRACTICE_TASK_READ_FAILED: ${error}`)
    } finally {
      this.closeResultSetQuietly(resultSet)
    }
  }

  async listPendingTasks(): Promise<AssessmentTask[]> {
    try {
      const store = await this.getStore()
      const predicates = new relationalStore.RdbPredicates(TABLE_TASK)
      predicates.in('status', [AssessmentTaskStatus.LOCAL_PENDING, AssessmentTaskStatus.FAILED])
      predicates.orderByAsc('created_at')
      return this.queryTasks(store, predicates)
    } catch (error) {
      throw new Error(`PENDING_TASKS_READ_FAILED: ${error}`)
    }
  }

  async saveResults(localTaskId: string, results: CharacterResult[]): Promise<void> {
    try {
      const store = await this.getStore()
      const predicates = new relationalStore.RdbPredicates(TABLE_TASK)
      predicates.equalTo('local_task_id', localTaskId)
      const values: relationalStore.ValuesBucket = {
        results_json: JSON.stringify(results),
        status: AssessmentTaskStatus.COMPLETED
      }
      await store.update(values, predicates)
    } catch (error) {
      throw new Error(`PRACTICE_RESULTS_SAVE_FAILED: ${error}`)
    }
  }

  async listProblemCharacters(studentId: string): Promise<CharacterResult[]> {
    try {
      const store = await this.getStore()
      const predicates = new relationalStore.RdbPredicates(TABLE_TASK)
      predicates.equalTo('student_id', studentId)
      predicates.and().equalTo('status', AssessmentTaskStatus.COMPLETED)
      predicates.orderByDesc('created_at')
      const tasks = await this.queryTasks(store, predicates)
      const problems: CharacterResult[] = []
      tasks.forEach((task: AssessmentTask) => {
        task.results.forEach((result: CharacterResult) => {
          if (result.category === CharacterCategory.WRONG ||
            result.category === CharacterCategory.UNATTRACTIVE) {
            problems.push(result)
          }
        })
      })
      return problems
    } catch (error) {
      throw new Error(`PROBLEM_CHARACTERS_READ_FAILED: ${error}`)
    }
  }

  private async getStore(): Promise<relationalStore.RdbStore> {
    if (this.store !== undefined) {
      return this.store
    }
    const config: relationalStore.StoreConfig = {
      name: 'ziyoufang-practice.db',
      securityLevel: relationalStore.SecurityLevel.S3
    }
    try {
      this.store = await relationalStore.getRdbStore(this.context, config)
      await this.migrate(this.store)
      return this.store
    } catch (error) {
      this.store = undefined
      throw new Error(`PRACTICE_DATABASE_OPEN_FAILED: ${error}`)
    }
  }

  private async migrate(store: relationalStore.RdbStore): Promise<void> {
    try {
      if (store.version < 1) {
        await store.executeSql(CREATE_TASK_TABLE)
        store.version = DATABASE_VERSION
        return
      }
      // CREATE IF NOT EXISTS also repairs a missing table without changing user data.
      await store.executeSql(CREATE_TASK_TABLE)
    } catch (error) {
      throw new Error(`PRACTICE_DATABASE_MIGRATION_FAILED: ${error}`)
    }
  }

  private async queryTasks(store: relationalStore.RdbStore,
    predicates: relationalStore.RdbPredicates): Promise<AssessmentTask[]> {
    let resultSet: relationalStore.ResultSet | undefined
    const tasks: AssessmentTask[] = []
    try {
      resultSet = await store.query(predicates)
      while (resultSet.goToNextRow()) {
        tasks.push(this.readTask(resultSet))
      }
    } catch (error) {
      throw new Error(`PRACTICE_TASK_QUERY_FAILED: ${error}`)
    } finally {
      this.closeResultSetQuietly(resultSet)
    }
    return tasks
  }

  private readTask(resultSet: relationalStore.ResultSet): AssessmentTask {
    try {
      const resultsJson = resultSet.getString(resultSet.getColumnIndex('results_json'))
      const results = JSON.parse(resultsJson) as CharacterResult[]
      return new AssessmentTask(
        resultSet.getString(resultSet.getColumnIndex('local_task_id')),
        resultSet.getString(resultSet.getColumnIndex('idempotency_key')),
        resultSet.getString(resultSet.getColumnIndex('student_id')),
        resultSet.getString(resultSet.getColumnIndex('image_uri')),
        resultSet.getString(resultSet.getColumnIndex('expected_text')),
        resultSet.getString(resultSet.getColumnIndex('status')) as AssessmentTaskStatus,
        resultSet.getLong(resultSet.getColumnIndex('retry_count')),
        resultSet.getLong(resultSet.getColumnIndex('created_at')),
        results
      )
    } catch (error) {
      throw new Error(`PRACTICE_TASK_DECODE_FAILED: ${error}`)
    }
  }

  private closeResultSetQuietly(resultSet: relationalStore.ResultSet | undefined): void {
    if (resultSet === undefined) {
      return
    }
    try {
      resultSet.close()
    } catch (_error) {
      // Preserve the primary repository error; no student or assessment data is logged.
    }
  }
}
