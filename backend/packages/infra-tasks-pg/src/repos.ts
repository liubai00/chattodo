// @linx/infra-tasks-pg · 仓储实现（实现 domain-tasks 端口）。
// 参数化 SQL（$n）逐字节承接现网 repositories/index.js；时间用 naive-local minute 精度
// （与现网 nowIso 一致，Strangler 期同表排序兼容，时区迁移 P7）；新 id 用前缀化 UUIDv7。
import { makePrefixedId } from '@linx/kernel-ids'
import type {
  TaskRepo,
  IdeaRepo,
  NonTodoRepo,
  CaptureRecordRepo,
  CorrectionRepo,
  SubtaskRepo,
  CommentRepo,
  ActivityRepo,
  Task,
  TodoIdea,
  NonTodo,
  CaptureRecord,
  Subtask,
  Comment,
  Activity,
  TaskAccess,
} from '@linx/domain-tasks'
import {
  rowToTask,
  rowToIdea,
  rowToNon,
  rowToRecord,
  rowToSubtask,
  rowToComment,
  rowToActivity,
} from './mappers.js'

/** 最小 DB 执行面（platform-db 的 DbHandle 结构性满足）。 */
export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface RepoDeps {
  db: Queryable
  userId: string
  /** 时间源；默认 () => new Date()。注入以测试确定化。 */
  clock?: () => Date
  /** id 生成；默认 kernel-ids 前缀化 UUIDv7。注入以测试确定化。 */
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** 任务访问权判定（owner/collaborator/null），承接现网 taskAccess；被 TaskRepo 与 SubtaskRepo 共用。 */
async function taskAccessOf(db: Queryable, userId: string, taskId: string): Promise<TaskAccess> {
  const rows = await db.execute<{ user_id: string }>('SELECT user_id FROM tasks WHERE id = $1', [
    taskId,
  ])
  const row = rows[0]
  if (!row) return null
  if (row.user_id === userId) return 'owner'
  const collab = await db.execute(
    `SELECT 1 AS ok FROM task_collaborators WHERE task_id = $1 AND user_id = $2 AND status = 'accepted'`,
    [taskId, userId],
  )
  return collab[0] ? 'collaborator' : null
}

interface Resolved {
  db: Queryable
  userId: string
  nowIso: () => string
  genId: (prefix: string) => string
}

function resolve(deps: RepoDeps): Resolved {
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())
  return { db: deps.db, userId: deps.userId, nowIso, genId }
}

// 动态 SET 构造：仅纳入 patch 中存在的字段（camel→col），末尾恒附 updated_at。
function buildSet(
  cols: Record<string, string>,
  patch: Record<string, unknown>,
  nowIso: string,
): { setSql: string; params: unknown[] } {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, col] of Object.entries(cols)) {
    if (!(key in patch)) continue
    const raw = patch[key]
    params.push(key === 'tags' ? JSON.stringify(raw ?? []) : raw)
    sets.push(`${col} = $${params.length}`)
  }
  params.push(nowIso)
  sets.push(`updated_at = $${params.length}`)
  return { setSql: sets.join(', '), params }
}

const TASK_COLS: Record<string, string> = {
  title: 'title',
  notes: 'notes',
  status: 'status',
  projectId: 'project_id',
  tags: 'tags',
  context: 'context',
  dueAt: 'due_at',
  plannedAt: 'planned_at',
  durationMinutes: 'duration_minutes',
  priority: 'priority',
  privacyScope: 'privacy_scope',
  sourceIdeaId: 'source_idea_id',
  assignee: 'assignee',
}

export function makeTaskRepo(deps: RepoDeps): TaskRepo {
  const { db, userId, nowIso, genId } = resolve(deps)

  // 不变量：selectById 故意【不带 user_id】。所有调用方必须先过 access(id) 门禁（get/update），
  // 或读回刚以当前 userId 插入的行（create）。切勿无门禁调用 → 那将是跨用户读泄露。
  const selectById = async (id: string): Promise<Task | undefined> => {
    const rows = await db.execute('SELECT * FROM tasks WHERE id = $1', [id])
    return rows[0] ? rowToTask(rows[0]) : undefined
  }

  const access = (id: string): Promise<TaskAccess> => taskAccessOf(db, userId, id)

  return {
    access,

    async all(): Promise<Task[]> {
      const rows = await db.execute(
        // 二级排序键 id DESC：created_at 为分精度，同分钟行加唯一 PK 保证确定性全序
        // （避免 UPDATE/VACUUM 后同分钟组重排）。承接现网主序，仅补确定性。
        `SELECT * FROM tasks WHERE user_id = $1 OR id IN (SELECT task_id FROM task_collaborators WHERE user_id = $2 AND status = 'accepted') ORDER BY created_at DESC, id DESC`,
        [userId, userId],
      )
      return rows.map(rowToTask)
    },

    async get(id: string): Promise<Task | undefined> {
      if ((await access(id)) === null) return undefined
      return selectById(id)
    },

    async create(input): Promise<Task> {
      const id = input.id ?? genId('task')
      const ts = nowIso()
      await db.execute(
        `INSERT INTO tasks (id,user_id,title,notes,status,project_id,tags,context,due_at,planned_at,duration_minutes,priority,privacy_scope,source_idea_id,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          id,
          userId,
          input.title,
          input.notes ?? '',
          input.status ?? 'todo',
          input.projectId ?? null,
          JSON.stringify(input.tags ?? []),
          input.context ?? '',
          input.dueAt ?? null,
          input.plannedAt ?? null,
          input.durationMinutes ?? null,
          input.priority ?? 3,
          input.privacyScope ?? 'work',
          input.sourceIdeaId ?? null,
          ts,
          ts,
        ],
      )
      const created = await selectById(id)
      if (!created) throw new Error('task create failed')
      return created
    },

    async update(id, patch): Promise<Task | undefined> {
      const acc = await access(id)
      if (acc === null) return undefined
      if (acc === 'collaborator') {
        // 协作者仅可改 status。`patch.status !== undefined` 是对现网（仅 `'status' in patch`）的
        // 【有意收紧】：显式 status=undefined 语义为「不改状态」，故不写 NULL、不动 updated_at。
        // 真实请求路径（JSON.parse）不会产生「键存在但值为 undefined」，故与现网无可达分歧。
        if ('status' in patch && patch.status !== undefined) {
          await db.execute('UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3', [
            patch.status,
            nowIso(),
            id,
          ])
        }
        return selectById(id)
      }
      const { setSql, params } = buildSet(TASK_COLS, patch as Record<string, unknown>, nowIso())
      params.push(id)
      const idParam = params.length
      params.push(userId)
      const userParam = params.length
      await db.execute(
        `UPDATE tasks SET ${setSql} WHERE id = $${idParam} AND user_id = $${userParam}`,
        params,
      )
      return selectById(id)
    },

    async remove(id): Promise<void> {
      await db.execute('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId])
    },
  }
}

const IDEA_COLS: Record<string, string> = {
  title: 'title',
  status: 'status',
  suggestedNextAction: 'suggested_next_action',
  aiReason: 'ai_reason',
  privacyScope: 'privacy_scope',
}

export function makeIdeaRepo(deps: RepoDeps): IdeaRepo {
  const { db, userId, nowIso, genId } = resolve(deps)

  const selectOne = async (id: string): Promise<TodoIdea | undefined> => {
    const rows = await db.execute('SELECT * FROM todo_ideas WHERE id = $1 AND user_id = $2', [
      id,
      userId,
    ])
    return rows[0] ? rowToIdea(rows[0]) : undefined
  }

  return {
    async all(): Promise<TodoIdea[]> {
      const rows = await db.execute(
        'SELECT * FROM todo_ideas WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
        [userId],
      )
      return rows.map(rowToIdea)
    },

    get: selectOne,

    async create(input): Promise<TodoIdea> {
      const id = input.id ?? genId('idea')
      const ts = nowIso()
      await db.execute(
        `INSERT INTO todo_ideas (id,user_id,title,raw_text,status,suggested_next_action,ai_reason,privacy_scope,source,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          userId,
          input.title,
          input.rawText ?? '',
          input.status ?? 'clarifying',
          input.suggestedNextAction ?? '',
          input.aiReason ?? '',
          input.privacyScope ?? 'work',
          input.source ?? 'chat',
          ts,
          ts,
        ],
      )
      const created = await selectOne(id)
      if (!created) throw new Error('idea create failed')
      return created
    },

    async update(id, patch): Promise<TodoIdea | undefined> {
      const { setSql, params } = buildSet(IDEA_COLS, patch as Record<string, unknown>, nowIso())
      params.push(id)
      const idParam = params.length
      params.push(userId)
      const userParam = params.length
      await db.execute(
        `UPDATE todo_ideas SET ${setSql} WHERE id = $${idParam} AND user_id = $${userParam}`,
        params,
      )
      return selectOne(id)
    },

    async remove(id): Promise<void> {
      await db.execute('DELETE FROM todo_ideas WHERE id = $1 AND user_id = $2', [id, userId])
    },
  }
}

export function makeNonTodoRepo(deps: RepoDeps): NonTodoRepo {
  const { db, userId, nowIso, genId } = resolve(deps)

  const selectOne = async (id: string): Promise<NonTodo | undefined> => {
    const rows = await db.execute(
      'SELECT * FROM non_todo_outputs WHERE id = $1 AND user_id = $2',
      [id, userId],
    )
    return rows[0] ? rowToNon(rows[0]) : undefined
  }

  return {
    async all(): Promise<NonTodo[]> {
      const rows = await db.execute(
        'SELECT * FROM non_todo_outputs WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
        [userId],
      )
      return rows.map(rowToNon)
    },

    get: selectOne,

    async create(input): Promise<NonTodo> {
      const id = input.id ?? genId('non')
      const ts = nowIso()
      await db.execute(
        `INSERT INTO non_todo_outputs (id,user_id,title,summary,raw_text,reason,suggested_destination,privacy_scope,source,corrected,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          id,
          userId,
          input.title,
          input.summary ?? '',
          input.rawText ?? '',
          input.reason ?? '',
          input.suggestedDestination ?? 'archive',
          input.privacyScope ?? 'work',
          input.source ?? 'chat',
          input.corrected ? 1 : 0,
          ts,
          ts,
        ],
      )
      const created = await selectOne(id)
      if (!created) throw new Error('non-todo create failed')
      return created
    },

    async remove(id): Promise<void> {
      await db.execute('DELETE FROM non_todo_outputs WHERE id = $1 AND user_id = $2', [id, userId])
    },
  }
}

export function makeCaptureRecordRepo(deps: RepoDeps): CaptureRecordRepo {
  const { db, userId, nowIso, genId } = resolve(deps)

  return {
    async getByEntity(type, id): Promise<CaptureRecord | undefined> {
      const rows = await db.execute(
        `SELECT * FROM capture_records WHERE user_id = $1 AND result_entity_type = $2 AND result_entity_id = $3 ORDER BY created_at DESC LIMIT 1`,
        [userId, type, id],
      )
      return rows[0] ? rowToRecord(rows[0]) : undefined
    },

    async relink(oldEntityId, newType, newId): Promise<void> {
      await db.execute(
        `UPDATE capture_records SET result_entity_type = $1, result_entity_id = $2 WHERE user_id = $3 AND result_entity_id = $4`,
        [newType, newId, userId, oldEntityId],
      )
    },

    async create(input): Promise<CaptureRecord> {
      const id = input.id ?? genId('rec')
      const ts = nowIso()
      await db.execute(
        `INSERT INTO capture_records (id,user_id,raw_input,source,ai_kind,confidence,ai_reason,result_entity_type,result_entity_id,status,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          userId,
          input.rawInput,
          input.source ?? 'chat',
          input.aiKind,
          input.confidence ?? null,
          input.aiReason ?? '',
          input.resultEntityType ?? null,
          input.resultEntityId ?? null,
          input.status ?? 'ok',
          ts,
        ],
      )
      const rows = await db.execute('SELECT * FROM capture_records WHERE id = $1', [id])
      if (!rows[0]) throw new Error('capture record create failed')
      return rowToRecord(rows[0])
    },
  }
}

export function makeCorrectionRepo(deps: RepoDeps): CorrectionRepo {
  const { db, userId, nowIso, genId } = resolve(deps)

  return {
    async create(input): Promise<string> {
      const id = genId('corr')
      await db.execute(
        `INSERT INTO corrections (id,user_id,entity_type,entity_id,from_kind,to_kind,note,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          userId,
          input.entityType,
          input.entityId,
          input.fromKind ?? null,
          input.toKind ?? null,
          input.note ?? '',
          nowIso(),
        ],
      )
      return id
    },
  }
}

export function makeSubtaskRepo(deps: RepoDeps): SubtaskRepo {
  const { db, userId, nowIso, genId } = resolve(deps)

  return {
    async byTask(taskId): Promise<Subtask[]> {
      if ((await taskAccessOf(db, userId, taskId)) === null) return []
      const rows = await db.execute(
        'SELECT * FROM subtasks WHERE task_id = $1 ORDER BY created_at, id',
        [taskId],
      )
      return rows.map(rowToSubtask)
    },

    async create(taskId, text): Promise<Subtask> {
      const id = genId('sub')
      await db.execute(
        'INSERT INTO subtasks (id,user_id,task_id,text,done,created_at) VALUES ($1,$2,$3,$4,0,$5)',
        [id, userId, taskId, text, nowIso()],
      )
      const rows = await db.execute('SELECT * FROM subtasks WHERE id = $1', [id])
      if (!rows[0]) throw new Error('subtask create failed')
      return rowToSubtask(rows[0])
    },

    async toggle(id): Promise<Subtask | undefined> {
      const rows = await db.execute<{ task_id: string; done: number }>(
        'SELECT task_id, done FROM subtasks WHERE id = $1',
        [id],
      )
      const row = rows[0]
      if (!row) return undefined
      if ((await taskAccessOf(db, userId, row.task_id)) === null) return undefined
      await db.execute('UPDATE subtasks SET done = $1 WHERE id = $2', [row.done ? 0 : 1, id])
      const after = await db.execute('SELECT * FROM subtasks WHERE id = $1', [id])
      return after[0] ? rowToSubtask(after[0]) : undefined
    },

    async remove(id): Promise<void> {
      const rows = await db.execute<{ task_id: string }>(
        'SELECT task_id FROM subtasks WHERE id = $1',
        [id],
      )
      const row = rows[0]
      if (!row) return
      if ((await taskAccessOf(db, userId, row.task_id)) === null) return
      await db.execute('DELETE FROM subtasks WHERE id = $1', [id])
    },
  }
}

export function makeCommentRepo(deps: RepoDeps): CommentRepo {
  const { db, userId, nowIso, genId } = resolve(deps)

  return {
    async byTask(taskId): Promise<Comment[]> {
      if ((await taskAccessOf(db, userId, taskId)) === null) return []
      const rows = await db.execute(
        'SELECT * FROM comments WHERE task_id = $1 ORDER BY created_at, id',
        [taskId],
      )
      return rows.map(rowToComment)
    },

    async create(taskId, author, text): Promise<Comment> {
      const id = genId('cmt')
      await db.execute(
        'INSERT INTO comments (id,user_id,task_id,author,text,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, userId, taskId, author, text, nowIso()],
      )
      const rows = await db.execute('SELECT * FROM comments WHERE id = $1', [id])
      if (!rows[0]) throw new Error('comment create failed')
      return rowToComment(rows[0])
    },
  }
}

export function makeActivityRepo(deps: RepoDeps): ActivityRepo {
  const { db, userId, nowIso, genId } = resolve(deps)

  return {
    async byTask(taskId): Promise<Activity[]> {
      if ((await taskAccessOf(db, userId, taskId)) === null) return []
      const rows = await db.execute(
        'SELECT * FROM activity WHERE task_id = $1 ORDER BY created_at DESC, id DESC',
        [taskId],
      )
      return rows.map(rowToActivity)
    },

    async log(taskId, text): Promise<void> {
      await db.execute(
        'INSERT INTO activity (id,user_id,task_id,text,created_at) VALUES ($1,$2,$3,$4,$5)',
        [genId('act'), userId, taskId, text, nowIso()],
      )
    },
  }
}
