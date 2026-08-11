export class MemoryAssessmentRepository {
  #tasks = new Map()

  async create(task) {
    if (this.#tasks.has(task.taskId)) return structuredClone(this.#tasks.get(task.taskId))
    this.#tasks.set(task.taskId, structuredClone(task))
    return structuredClone(task)
  }

  async get(taskId) {
    const task = this.#tasks.get(taskId)
    return task ? structuredClone(task) : null
  }

  async update(taskId, patch) {
    const current = this.#tasks.get(taskId)
    if (!current) throw new Error('TASK_NOT_FOUND')
    const next = { ...current, ...structuredClone(patch) }
    this.#tasks.set(taskId, next)
    return structuredClone(next)
  }
}
