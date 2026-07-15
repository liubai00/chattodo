// @linx/app-tasks — Tasks BC use-case 编排（依赖 domain 端口 + 领域服务；infra 由 composition root 注入）。
// 忠实承接现网 services/tasks.js·ideas.js 与 routes 的编排顺序（含 move-out 的四步、convert 的建+改）。
// move-out/convert 沿用现网【顺序、非事务】语义（成功路径与现网逐字等价）；原子化留作后续 §hardening。
//
// 活动流 activity.log 已纳入（对应写路由已由 RouteRegistry 权威接管，legacy 不再处理，单次写入）：
//   createTask('任务已创建')、reopenTask('状态改为「待办」')、convertIdea('由待澄清项转为任务')、
//   convertNonToTask('由非 todo 转为任务')、addSubtask('添加子任务：…')——均经注入的 activity 端口复刻。
// ⚠ 仍 fall-through 到 legacy（携带【跨用户通知】，见 apps/api tasks.routes 注释）：
//   - updateTask（PATCH /api/tasks/:id：状态/指派 activity + notifyUserByName 指派通知）
//   - completeTask（POST /:id/done：完成 activity + notifyTaskDoneFx 通知协作者/关注者）
//   跨用户通知归 collab/notification BC，待 P5/P6，经注入 notify 端口或订阅 task.done/task.assigned 领域事件重建；
//   其就绪前 updateTask/completeTask 仅做数据变更（本文件即数据层真相），上述副作用由 legacy 承担。
import {
  filterTasks,
  visibleFilter,
  buildNonTodoFromTask,
  buildTaskFromIdea,
  buildTaskFromNon,
  type TaskRepo,
  type IdeaRepo,
  type NonTodoRepo,
  type CaptureRecordRepo,
  type CorrectionRepo,
  type SubtaskRepo,
  type ActivityRepo,
  type PrivacySettings,
  type TaskListFilter,
  type Task,
  type TodoIdea,
  type NonTodo,
  type CaptureRecord,
  type Subtask,
  type NewTaskInput,
  type TaskPatch,
} from '@linx/domain-tasks'

export interface TasksAppDeps {
  tasks: TaskRepo
  ideas: IdeaRepo
  nonTodos: NonTodoRepo
  captureRecords: CaptureRecordRepo
  corrections: CorrectionRepo
  activity: ActivityRepo
  subtasks: SubtaskRepo
  /** 隐私设置（来自 settings BC；未迁移前由 composition root 提供）。 */
  getPrivacySettings: () => Promise<PrivacySettings>
  /** 时间源（filterTasks 的 today 判定），默认 Date.now。 */
  now?: () => number
}

export interface TaskWithRecord {
  task: Task
  generationRecord: CaptureRecord | null
}

export interface TasksApp {
  listTasks(filter: TaskListFilter): Promise<Task[]>
  getTask(id: string): Promise<TaskWithRecord | undefined>
  createTask(input: NewTaskInput): Promise<Task>
  updateTask(id: string, patch: TaskPatch): Promise<Task | undefined>
  completeTask(id: string): Promise<Task | undefined>
  reopenTask(id: string): Promise<Task | undefined>
  moveOutTask(id: string): Promise<NonTodo | null>
  listSubtasks(taskId: string): Promise<Subtask[]>
  addSubtask(taskId: string, text: string): Promise<Subtask | null>
  toggleSubtask(id: string): Promise<Subtask | undefined>
  removeSubtask(id: string): Promise<void>
  listIdeas(): Promise<TodoIdea[]>
  convertIdea(id: string): Promise<{ task: Task; idea: TodoIdea } | null>
  archiveIdea(id: string): Promise<TodoIdea | undefined>
  discardIdea(id: string): Promise<boolean>
  listNonTodos(): Promise<NonTodo[]>
  convertNonToTask(id: string): Promise<{ task: Task } | null>
  discardNon(id: string): Promise<boolean>
}

export function makeTasksApp(deps: TasksAppDeps): TasksApp {
  const now = deps.now ?? ((): number => Date.now())

  return {
    async listTasks(filter) {
      const all = await deps.tasks.all()
      const settings = await deps.getPrivacySettings()
      const visible = visibleFilter(all, settings) // 先隐私过滤，再视图/范围/搜索（承接现网顺序）
      return filterTasks(visible, filter, now())
    },

    async getTask(id) {
      const task = await deps.tasks.get(id)
      if (!task) return undefined
      const rec = await deps.captureRecords.getByEntity('task', id)
      return { task, generationRecord: rec ?? null }
    },

    async createTask(input) {
      const t = await deps.tasks.create(input)
      await deps.activity.log(t.id, '任务已创建') // 承接现网 POST /api/tasks
      return t
    },

    updateTask(id, patch) {
      // 注：现网 PATCH 的 activity/通知副作用由【仍在 legacy 的 patch 路由】承担（见头部注释）
      return deps.tasks.update(id, patch)
    },

    completeTask(id) {
      // 注：现网 /done 的 activity + notifyTaskDoneFx 由【仍在 legacy 的 done 路由】承担
      return deps.tasks.update(id, { status: 'done' })
    },

    async reopenTask(id) {
      // 承接现网：reopen 恒回 todo，绝不 in_progress
      const t = await deps.tasks.update(id, { status: 'todo' })
      if (t) await deps.activity.log(id, '状态改为「待办」')
      return t
    },

    async moveOutTask(id) {
      const task = await deps.tasks.get(id)
      if (!task) return null
      const rec = await deps.captureRecords.getByEntity('task', id)
      const non = await deps.nonTodos.create(buildNonTodoFromTask(task, rec))
      await deps.captureRecords.relink(id, 'non_todo', non.id)
      await deps.corrections.create({
        entityType: 'non_todo',
        entityId: non.id,
        fromKind: 'task',
        toKind: 'non_todo',
        note: '移出 todo（误分类纠错）',
      })
      await deps.tasks.remove(id)
      return non
    },

    listSubtasks(taskId) {
      return deps.subtasks.byTask(taskId)
    },

    async addSubtask(taskId, text) {
      // 现网 POST /:id/subtasks 先校验任务存在（含访问权）→ 建 → 记活动
      if (!(await deps.tasks.get(taskId))) return null
      const sub = await deps.subtasks.create(taskId, text)
      await deps.activity.log(taskId, '添加子任务：' + text)
      return sub
    },

    toggleSubtask(id) {
      return deps.subtasks.toggle(id)
    },

    removeSubtask(id) {
      return deps.subtasks.remove(id)
    },

    listIdeas() {
      return deps.ideas.all()
    },

    async convertIdea(id) {
      const idea = await deps.ideas.get(id)
      if (!idea) return null
      const task = await deps.tasks.create(buildTaskFromIdea(idea))
      const updated = await deps.ideas.update(id, { status: 'converted' })
      await deps.activity.log(task.id, '由待澄清项转为任务') // 承接现网 convertIdeaToTask
      return { task, idea: updated ?? idea }
    },

    archiveIdea(id) {
      return deps.ideas.update(id, { status: 'archived' })
    },

    async discardIdea(id) {
      const idea = await deps.ideas.get(id)
      if (!idea) return false
      await deps.ideas.remove(id) // 硬删除（承接现网：discarded 状态不落库）
      return true
    },

    listNonTodos() {
      return deps.nonTodos.all()
    },

    async convertNonToTask(id) {
      const non = await deps.nonTodos.get(id)
      if (!non) return null
      const task = await deps.tasks.create(buildTaskFromNon(non))
      await deps.nonTodos.remove(id) // 硬删除（承接现网）
      await deps.activity.log(task.id, '由非 todo 转为任务') // 承接现网 convertNonToTask
      return { task }
    },

    async discardNon(id) {
      const non = await deps.nonTodos.get(id)
      if (!non) return false
      await deps.nonTodos.remove(id)
      return true
    },
  }
}
