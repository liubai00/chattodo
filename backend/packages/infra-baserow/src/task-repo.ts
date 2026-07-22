import type { NewTaskInput, Task, TaskAccess, TaskPatch, TaskRepo, TaskStatus } from '@linx/domain-tasks'
import {
  decodeTaskRef,
  encodeTaskRef,
  type DynamicTaskRow,
  type TaskDatabaseActor,
  type TaskDatabasePort,
  type TaskMutationSource,
  type TaskSpace,
} from '@linx/domain-task-database'

export interface BaserowTaskRepoOptions {
  readonly database: TaskDatabasePort
  readonly actor: TaskDatabaseActor
  readonly source?: TaskMutationSource
}

const STATUS_TO_BASEROW: Record<TaskStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  archived: '已归档',
}

function statusFrom(value: unknown): TaskStatus {
  const normalized = String(
    value && typeof value === 'object' && 'value' in value
      ? (value as { value?: unknown }).value ?? ''
      : value ?? '',
  ).trim().toLowerCase()
  if (normalized === '进行中' || normalized === 'in_progress') return 'in_progress'
  if (normalized === '已完成' || normalized === 'done') return 'done'
  if (normalized === '已归档' || normalized === 'archived') return 'archived'
  return 'todo'
}

function stringValue(values: Readonly<Record<string, unknown>>, ...keys: string[]): string {
  for (const key of keys) {
    const value = values[key]
    if (typeof value === 'string') return value
    if (value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string') {
      return String((value as { value: string }).value)
    }
  }
  return ''
}

function rowToTask(row: DynamicTaskRow): Task {
  const values = row.values
  const collaborators = values['负责人']
  const firstAssignee = Array.isArray(collaborators) ? collaborators[0] : undefined
  const assignee =
    firstAssignee && typeof firstAssignee === 'object'
      ? String((firstAssignee as { name?: unknown; first_name?: unknown }).name ?? (firstAssignee as { first_name?: unknown }).first_name ?? '') || null
      : null
  return {
    id: encodeTaskRef(row.ref),
    title: stringValue(values, '任务名称', 'Name'),
    notes: '',
    status: statusFrom(values['状态']),
    projectId: null,
    tags: [],
    context: '',
    dueAt: stringValue(values, '截止日期') || null,
    plannedAt: null,
    durationMinutes: null,
    priority: 3,
    privacyScope: row.ref.space === 'personal' ? 'personal' : 'work',
    sourceIdeaId: null,
    assignee,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function createValues(input: NewTaskInput): Record<string, unknown> {
  const values: Record<string, unknown> = {
    '任务名称': input.title,
    '状态': STATUS_TO_BASEROW[input.status ?? 'todo'],
  }
  if (input.dueAt) values['截止日期'] = input.dueAt
  return values
}

function patchValues(patch: TaskPatch): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  if (patch.title !== undefined) values['任务名称'] = patch.title
  if (patch.status !== undefined) values['状态'] = STATUS_TO_BASEROW[patch.status]
  if (patch.dueAt !== undefined) values['截止日期'] = patch.dueAt
  if (patch.assignee !== undefined) values['负责人'] = patch.assignee
  return values
}

export function makeBaserowTaskRepo(options: BaserowTaskRepoOptions): TaskRepo {
  const { database, actor } = options
  const source = options.source ?? { kind: 'system', text: 'LinX 后端任务操作' }

  return {
    async all() {
      const [team, personal] = await Promise.all([
        database.listRows(actor, 'team'),
        database.listRows(actor, 'personal'),
      ])
      return [...team, ...personal].map(rowToTask).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },

    async get(id) {
      const ref = decodeTaskRef(id)
      if (!ref) return undefined
      const row = await database.getRow(actor, ref)
      return row ? rowToTask(row) : undefined
    },

    async access(id): Promise<TaskAccess> {
      const ref = decodeTaskRef(id)
      if (!ref) return null
      const row = await database.getRow(actor, ref)
      return row?.access ?? null
    },

    async create(input) {
      const space: TaskSpace = input.privacyScope === 'personal' ? 'personal' : 'team'
      return rowToTask(await database.createRow(actor, space, createValues(input), source))
    },

    async update(id, patch) {
      const ref = decodeTaskRef(id)
      if (!ref) return undefined
      const row = await database.updateRow(actor, ref, patchValues(patch), source)
      return row ? rowToTask(row) : undefined
    },

    async remove(id) {
      const ref = decodeTaskRef(id)
      if (!ref) return
      await database.deleteRow(actor, ref, 'confirmed-by-linx')
    },
  }
}
