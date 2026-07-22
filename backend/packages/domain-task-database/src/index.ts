/**
 * Baserow-backed task database boundary.
 *
 * TaskRef is the only task identifier allowed to cross the LinX/Baserow boundary.
 * The `brw:` string form exists solely for compatibility with the old string-id
 * application ports while the UI and HTTP contracts migrate to the structured form.
 */
export type TaskSpace = 'team' | 'personal'

export interface TaskRef {
  readonly space: TaskSpace
  readonly tableId: number
  readonly rowId: number
}

export interface TaskDatabaseActor {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: string
}

export type TaskMutationSource =
  | {
      readonly kind: 'chat'
      readonly text: string
      readonly messageId?: string
    }
  | {
      readonly kind: 'manual'
      readonly text?: string
    }
  | {
      readonly kind: 'system'
      readonly text: string
    }

export type TaskFieldKind =
  | 'text'
  | 'long_text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'single_select'
  | 'multiple_select'
  | 'multiple_collaborators'

export interface TaskField {
  readonly id: number
  readonly name: string
  readonly type: string
  readonly primary: boolean
  readonly readOnly: boolean
  readonly hidden: boolean
}

export interface TaskTableDescriptor {
  readonly space: TaskSpace
  readonly databaseId: number
  readonly tableId: number
  readonly viewId: number
  readonly fields: readonly TaskField[]
}

export interface TaskDatabaseSchema {
  readonly workspaceId: number
  readonly databaseId: number
  readonly tables: Record<TaskSpace, TaskTableDescriptor>
}

export type TaskViewFilterType = string
export type TaskViewOrder = 'ASC' | 'DESC'

export interface TaskViewFilter {
  readonly id: number
  readonly fieldId: number
  readonly type: TaskViewFilterType
  readonly value: string
}

export interface TaskViewSort {
  readonly id: number
  readonly fieldId: number
  readonly order: TaskViewOrder
  readonly type: string
}

export interface TaskViewGroupBy extends TaskViewSort {
  readonly width: number
}

/**
 * The collaborative Grid configuration shared by every LinX team member.
 * Filters are intentionally flat in v1; users can still use Baserow's native UI
 * for nested filter groups, which are returned as their flattened leaf filters.
 */
export interface TaskGridView {
  readonly id: number
  readonly filterType: 'AND' | 'OR'
  readonly filtersDisabled: boolean
  readonly filters: readonly TaskViewFilter[]
  readonly sorts: readonly TaskViewSort[]
  readonly groupBys: readonly TaskViewGroupBy[]
}

export interface TaskGridViewPatch {
  readonly filterType?: 'AND' | 'OR'
  readonly filtersDisabled?: boolean
  readonly filters?: readonly {
    readonly fieldId: number
    readonly type: TaskViewFilterType
    readonly value: string
  }[]
  readonly sorts?: readonly {
    readonly fieldId: number
    readonly order: TaskViewOrder
    readonly type?: string
  }[]
  readonly groupBys?: readonly {
    readonly fieldId: number
    readonly order: TaskViewOrder
    readonly type?: string
    readonly width?: number
  }[]
}

export interface DynamicTaskRow {
  readonly ref: TaskRef
  readonly values: Readonly<Record<string, unknown>>
  readonly createdAt: string
  readonly updatedAt: string
  readonly access: 'owner' | 'collaborator'
}

export interface TaskDatabasePort {
  schema(actor: TaskDatabaseActor): Promise<TaskDatabaseSchema>
  listRows(actor: TaskDatabaseActor, space: TaskSpace): Promise<readonly DynamicTaskRow[]>
  getRow(actor: TaskDatabaseActor, ref: TaskRef): Promise<DynamicTaskRow | undefined>
  createRow(
    actor: TaskDatabaseActor,
    space: TaskSpace,
    values: Readonly<Record<string, unknown>>,
    source: TaskMutationSource,
  ): Promise<DynamicTaskRow>
  updateRow(
    actor: TaskDatabaseActor,
    ref: TaskRef,
    values: Readonly<Record<string, unknown>>,
    source: TaskMutationSource,
  ): Promise<DynamicTaskRow | undefined>
  deleteRow(actor: TaskDatabaseActor, ref: TaskRef, confirmation: string): Promise<boolean>
  createField(
    actor: TaskDatabaseActor,
    space: TaskSpace,
    field: { name: string; type: TaskFieldKind; options?: Readonly<Record<string, unknown>> },
  ): Promise<TaskField>
  updateField(
    actor: TaskDatabaseActor,
    space: TaskSpace,
    fieldId: number,
    patch: Readonly<Record<string, unknown>>,
    confirmation?: string,
  ): Promise<TaskField>
  deleteField(actor: TaskDatabaseActor, space: TaskSpace, fieldId: number, confirmation: string): Promise<boolean>
  getView(actor: TaskDatabaseActor, space: TaskSpace): Promise<TaskGridView>
  updateView(actor: TaskDatabaseActor, space: TaskSpace, patch: TaskGridViewPatch): Promise<TaskGridView>
}

const TASK_REF_RE = /^brw:(team|personal):(\d+):(\d+)$/

export function encodeTaskRef(ref: TaskRef): string {
  if (!Number.isSafeInteger(ref.tableId) || ref.tableId <= 0 || !Number.isSafeInteger(ref.rowId) || ref.rowId <= 0) {
    throw new TypeError('TaskRef tableId/rowId must be positive safe integers')
  }
  return `brw:${ref.space}:${ref.tableId}:${ref.rowId}`
}

export function decodeTaskRef(value: string): TaskRef | undefined {
  const match = TASK_REF_RE.exec(String(value))
  if (!match) return undefined
  const tableId = Number(match[2])
  const rowId = Number(match[3])
  if (!Number.isSafeInteger(tableId) || !Number.isSafeInteger(rowId) || tableId <= 0 || rowId <= 0) return undefined
  return { space: match[1] as TaskSpace, tableId, rowId }
}

export function isTaskRef(value: unknown): value is TaskRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as Partial<TaskRef>
  return (
    (ref.space === 'team' || ref.space === 'personal') &&
    Number.isSafeInteger(ref.tableId) &&
    Number(ref.tableId) > 0 &&
    Number.isSafeInteger(ref.rowId) &&
    Number(ref.rowId) > 0
  )
}
