// @linx/app-tasks — Tasks BC use-case 编排（依赖 domain 端口 + 领域服务；infra 由 composition root 注入）。
// 忠实承接现网 services/tasks.js·ideas.js 与 routes 的编排顺序（含 move-out 的四步、convert 的建+改）。
// move-out/convert 沿用现网【顺序、非事务】语义（成功路径与现网逐字等价）；原子化留作后续 §hardening。
//
// ⚠ 副作用尚未纳入（故对应【写路由暂不切权威】，仍 fall-through 到 legacy，见 apps/api tasks.routes 注释）：
//   - activity.log（'任务已创建'/'状态改为「X」'/'由待澄清项转为任务'/'由非 todo 转为任务'）：Tasks 内部活动流，
//     待 P2-c 迁 activity 表后经注入的 activity 端口在 createTask/convert*/updateTask 内复刻。
//   - 跨用户通知 notifyTaskDoneFx（完成通知给协作者/关注者）、notifyUserByName（指派通知）：collab/notification BC，
//     待 P5/P6，经注入的 notify 端口或发布 task.done / task.assigned 领域事件由其订阅重建。
//   在这些端口就绪前，completeTask/updateTask/convert* 仅做数据变更（本文件即数据层真相），副作用由 legacy 承担。
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
  type PrivacySettings,
  type TaskListFilter,
  type Task,
  type TodoIdea,
  type NonTodo,
  type CaptureRecord,
  type NewTaskInput,
  type TaskPatch,
} from '@linx/domain-tasks'

export interface TasksAppDeps {
  tasks: TaskRepo
  ideas: IdeaRepo
  nonTodos: NonTodoRepo
  captureRecords: CaptureRecordRepo
  corrections: CorrectionRepo
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

    createTask(input) {
      return deps.tasks.create(input)
    },

    updateTask(id, patch) {
      return deps.tasks.update(id, patch)
    },

    completeTask(id) {
      return deps.tasks.update(id, { status: 'done' })
    },

    reopenTask(id) {
      // 承接现网：reopen 恒回 todo，绝不 in_progress
      return deps.tasks.update(id, { status: 'todo' })
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

    listIdeas() {
      return deps.ideas.all()
    },

    async convertIdea(id) {
      const idea = await deps.ideas.get(id)
      if (!idea) return null
      const task = await deps.tasks.create(buildTaskFromIdea(idea))
      const updated = await deps.ideas.update(id, { status: 'converted' })
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
