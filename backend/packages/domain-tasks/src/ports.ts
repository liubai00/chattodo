// @linx/domain-tasks · 端口（仓储接口；infra-tasks-pg 实现，app-tasks 依赖）。
import type {
  Task,
  TodoIdea,
  NonTodo,
  CaptureRecord,
  Subtask,
  Comment,
  Activity,
  TaskAccess,
  NewTaskInput,
  TaskPatch,
  NewIdeaInput,
  IdeaPatch,
  NewNonTodoInput,
  NewCaptureRecordInput,
  NewCorrectionInput,
} from './model.js'

export interface TaskRepo {
  /** 本人 + 已接受协作的任务，created_at DESC。 */
  all(): Promise<Task[]>
  /** 有访问权（owner/collaborator）才返回。 */
  get(id: string): Promise<Task | undefined>
  access(id: string): Promise<TaskAccess>
  create(input: NewTaskInput): Promise<Task>
  /** owner 全量 patch；collaborator 仅 status；无权限 → undefined。 */
  update(id: string, patch: TaskPatch): Promise<Task | undefined>
  /** owner-only（WHERE user_id）。 */
  remove(id: string): Promise<void>
}

export interface IdeaRepo {
  all(): Promise<TodoIdea[]>
  get(id: string): Promise<TodoIdea | undefined>
  create(input: NewIdeaInput): Promise<TodoIdea>
  update(id: string, patch: IdeaPatch): Promise<TodoIdea | undefined>
  remove(id: string): Promise<void>
}

export interface NonTodoRepo {
  all(): Promise<NonTodo[]>
  get(id: string): Promise<NonTodo | undefined>
  create(input: NewNonTodoInput): Promise<NonTodo>
  remove(id: string): Promise<void>
}

export interface CaptureRecordRepo {
  getByEntity(type: string, id: string): Promise<CaptureRecord | undefined>
  relink(oldEntityId: string, newType: string, newId: string): Promise<void>
  create(input: NewCaptureRecordInput): Promise<CaptureRecord>
}

export interface CorrectionRepo {
  create(input: NewCorrectionInput): Promise<string>
}

export interface SubtaskRepo {
  /** 有任务访问权才返回，否则 []（承接现网 taskAccess 门禁）。 */
  byTask(taskId: string): Promise<Subtask[]>
  create(taskId: string, text: string): Promise<Subtask>
  /** 切换 done；无访问权返回 undefined。 */
  toggle(id: string): Promise<Subtask | undefined>
  remove(id: string): Promise<void>
}

export interface CommentRepo {
  byTask(taskId: string): Promise<Comment[]>
  create(taskId: string, author: string, text: string): Promise<Comment>
}

export interface ActivityRepo {
  byTask(taskId: string): Promise<Activity[]>
  log(taskId: string, text: string): Promise<void>
}
