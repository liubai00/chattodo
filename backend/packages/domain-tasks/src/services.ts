// @linx/domain-tasks · 领域服务（纯，无 I/O）— 从现网 services/tasks.js·privacy.js·dates.js 抽取。
import type {
  Task,
  TaskView,
  PrivacyScope,
  TodoIdea,
  NonTodo,
  CaptureRecord,
  NewTaskInput,
  NewNonTodoInput,
} from './model.js'

// ── 日期（本地日历比较；now 注入以便测试）──

export function isToday(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return false
  const d = new Date(iso)
  const n = new Date(now)
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  )
}

export function isOverdue(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return false
  return new Date(iso).getTime() < now
}

// ── 列表过滤（承接 filterTasks；顺序：scope → view → search，不重排）──

export interface TaskListFilter {
  view?: TaskView
  scope?: string
  search?: string
}

export function filterTasks(
  tasks: readonly Task[],
  filter: TaskListFilter = {},
  now: number = Date.now(),
): Task[] {
  let out = [...tasks]
  if (filter.scope && filter.scope !== 'all') {
    out = out.filter((t) => t.privacyScope === filter.scope)
  }
  const view: TaskView = filter.view ?? 'all'
  if (view === 'open') out = out.filter((t) => t.status === 'todo' || t.status === 'in_progress')
  else if (view === 'done') out = out.filter((t) => t.status === 'done')
  else if (view === 'today') out = out.filter((t) => isToday(t.dueAt, now) || isToday(t.plannedAt, now))
  // view === 'all'：不按状态过滤
  const q = filter.search?.trim().toLowerCase()
  if (q) {
    out = out.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.notes.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    )
  }
  return out
}

// ── 隐私可见性（承接 visibleFilter）──

export interface PrivacySettings {
  privacyMode: boolean
  workspaceMode: 'work' | 'personal'
}

export function visibleFilter<T extends { privacyScope: PrivacyScope }>(
  items: readonly T[],
  settings: PrivacySettings,
): T[] {
  if (!settings.privacyMode) return [...items]
  const mode = settings.workspaceMode
  return items.filter((it) => it.privacyScope === mode || it.privacyScope === 'mixed')
}

// ── 协作者权限：仅可 PATCH status（承接 repositories update 的 collaborator 分支）──

export function collaboratorPatch(patch: Record<string, unknown>): { status?: unknown } {
  return 'status' in patch ? { status: patch.status } : {}
}

// ── 生命周期映射（纯，供 app 层编排）──

/** move-out：task → 新 non-todo 输入（承接 services/tasks.js moveOutOfTodo 的字段规则）。 */
export function buildNonTodoFromTask(task: Task, rec?: CaptureRecord): NewNonTodoInput {
  return {
    title: task.title,
    summary: task.notes || task.title,
    rawText: rec?.rawInput || task.notes || task.title,
    reason: rec?.aiReason || '用户手动从 todo 主系统移出（误分类纠错）。',
    suggestedDestination: 'archive',
    privacyScope: task.privacyScope,
    source: 'correction',
    corrected: true,
  }
}

/** idea → task 输入（承接 convertIdeaToTask：durationMinutes=30, sourceIdeaId=idea.id）。 */
export function buildTaskFromIdea(idea: TodoIdea): NewTaskInput {
  return {
    title: idea.title,
    notes: idea.rawText,
    status: 'todo',
    projectId: null,
    tags: [],
    context: '',
    dueAt: null,
    plannedAt: null,
    durationMinutes: 30,
    priority: 3,
    privacyScope: idea.privacyScope,
    sourceIdeaId: idea.id,
  }
}

/** non-todo → task 输入（承接 convertNonToTask：durationMinutes=30, sourceIdeaId=null）。 */
export function buildTaskFromNon(non: NonTodo): NewTaskInput {
  return {
    title: non.title,
    notes: non.rawText,
    status: 'todo',
    projectId: null,
    tags: [],
    context: '',
    dueAt: null,
    plannedAt: null,
    durationMinutes: 30,
    priority: 3,
    privacyScope: non.privacyScope,
    sourceIdeaId: null,
  }
}
