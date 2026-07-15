// @linx/domain-tasks · 模型 — Task / TodoIdea / NonTodo（同聚合），camelCase 领域形状。
// 精确承接现网 repositories toTask/toIdea/toNon 映射（见 server/src/repositories/index.js）。

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'archived'
export type Priority = 1 | 2 | 3 | 4
export type PrivacyScope = 'work' | 'personal' | 'mixed'
export type IdeaStatus = 'clarifying' | 'converted' | 'archived' | 'discarded'
export type NonDestination = 'archive' | 'copy' | 'export' | 'discard'
export type TaskView = 'open' | 'today' | 'done' | 'all'
export type AiKind = 'task' | 'todo_idea' | 'non_todo'
export type TaskAccess = 'owner' | 'collaborator' | null

export interface Task {
  id: string
  title: string
  notes: string
  status: TaskStatus
  projectId: string | null
  tags: string[]
  context: string
  dueAt: string | null
  plannedAt: string | null
  durationMinutes: number | null
  priority: Priority
  privacyScope: PrivacyScope
  sourceIdeaId: string | null
  assignee: string | null
  createdAt: string
  updatedAt: string
}

export interface TodoIdea {
  id: string
  title: string
  rawText: string
  status: IdeaStatus
  suggestedNextAction: string
  aiReason: string
  privacyScope: PrivacyScope
  source: string
  createdAt: string
  updatedAt: string
}

export interface NonTodo {
  id: string
  title: string
  summary: string
  rawText: string
  reason: string
  suggestedDestination: NonDestination
  privacyScope: PrivacyScope
  source: string
  corrected: boolean
  createdAt: string
  updatedAt: string
}

export interface Subtask {
  id: string
  text: string
  done: boolean
  createdAt: string
}

export interface Comment {
  id: string
  author: string
  text: string
  createdAt: string
}

export interface Activity {
  id: string
  text: string
  createdAt: string
}

export interface CaptureRecord {
  id: string
  rawInput: string
  source: string
  aiKind: AiKind
  confidence: number | null
  aiReason: string
  resultEntityType: string | null
  resultEntityId: string | null
  status: string
  createdAt: string
}

// ── 创建/更新输入（承接现网 repo create/update 的 data 形状）──

export interface NewTaskInput {
  id?: string
  title: string
  notes?: string
  status?: TaskStatus
  projectId?: string | null
  tags?: string[]
  context?: string
  dueAt?: string | null
  plannedAt?: string | null
  durationMinutes?: number | null
  priority?: Priority
  privacyScope?: PrivacyScope
  sourceIdeaId?: string | null
}

/** 可 PATCH 的任务字段（含 assignee，仅 owner 全量；collaborator 仅 status）。 */
export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'notes'
    | 'status'
    | 'projectId'
    | 'tags'
    | 'context'
    | 'dueAt'
    | 'plannedAt'
    | 'durationMinutes'
    | 'priority'
    | 'privacyScope'
    | 'sourceIdeaId'
    | 'assignee'
  >
>

export interface NewIdeaInput {
  id?: string
  title: string
  rawText?: string
  status?: IdeaStatus
  suggestedNextAction?: string
  aiReason?: string
  privacyScope?: PrivacyScope
  source?: string
}

/** Idea 仅这些字段可更新（rawText/source 不可改，承接现网）。 */
export type IdeaPatch = Partial<
  Pick<TodoIdea, 'title' | 'status' | 'suggestedNextAction' | 'aiReason' | 'privacyScope'>
>

export interface NewNonTodoInput {
  id?: string
  title: string
  summary?: string
  rawText?: string
  reason?: string
  suggestedDestination?: NonDestination
  privacyScope?: PrivacyScope
  source?: string
  corrected?: boolean
}

export interface NewCaptureRecordInput {
  id?: string
  rawInput: string
  source?: string
  aiKind: AiKind
  confidence?: number | null
  aiReason?: string
  resultEntityType?: string | null
  resultEntityId?: string | null
  status?: string
}

export interface NewCorrectionInput {
  entityType: string
  entityId: string
  fromKind?: string | null
  toKind?: string | null
  note?: string
}
