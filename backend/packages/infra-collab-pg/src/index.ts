// @linx/infra-collab-pg — 协作 / 自动规则仓储（1:1 承接 server repositories collaborators + autoRules）。
import { makePrefixedId } from '@linx/kernel-ids'
import {
  INVITE_COOLDOWN_MS,
  type AutoRule,
  type Collaborator,
  type CollabStatus,
} from '@linx/domain-collab'

export const COLLAB_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS task_collaborators (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    invited_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    remind INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    responded_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_collab_task ON task_collaborators(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_collab_user ON task_collaborators(user_id)`,
  `CREATE TABLE IF NOT EXISTS auto_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    keyword TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'invite',
    target_id TEXT NOT NULL,
    target_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_autorules_user ON auto_rules(user_id)`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface CollabRepoDeps {
  db: Queryable
  userId: string
  clock?: () => Date
  /** 冷却判定所用 epoch 毫秒源（注入以便测试确定化）。 */
  nowMs?: () => number
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const s = (v: unknown): string => (v == null ? '' : String(v))
const sOrNull = (v: unknown): string | null => (v == null ? null : String(v))

function toCollab(r: Record<string, unknown> | undefined): Collaborator | undefined {
  if (!r) return undefined
  return {
    id: s(r.id),
    taskId: s(r.task_id),
    ownerId: s(r.owner_id),
    userId: s(r.user_id),
    invitedBy: s(r.invited_by),
    status: s(r.status) as CollabStatus,
    remind: Number(r.remind) === 1,
    createdAt: s(r.created_at),
    respondedAt: sOrNull(r.responded_at),
  }
}

/** forTask 的展开行（含被邀请成员展示名）。 */
export interface CollaboratorRow extends Collaborator {
  userName: string
}
/** myPending 的展开行（含任务标题/到期/邀请人名）。 */
export interface PendingInviteRow extends Collaborator {
  taskTitle: string
  taskDueAt: string | null
  inviterName: string
}

export function makeCollaboratorRepo(deps: CollabRepoDeps) {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowMs = deps.nowMs ?? ((): number => Date.now())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())

  const get = async (id: string): Promise<Collaborator | undefined> =>
    toCollab((await db.execute('SELECT * FROM task_collaborators WHERE id = $1', [id]))[0])

  return {
    get,

    async forTask(taskId: string): Promise<CollaboratorRow[]> {
      const rows = await db.execute(
        `SELECT c.*, u.name AS user_name FROM task_collaborators c
           LEFT JOIN users u ON u.id = c.user_id
          WHERE c.task_id = $1 ORDER BY c.created_at`,
        [taskId],
      )
      return rows.map((r) => ({ ...toCollab(r)!, userName: s(r.user_name) || s(r.user_id) }))
    },

    async myPending(): Promise<PendingInviteRow[]> {
      const rows = await db.execute(
        `SELECT c.*, t.title AS task_title, t.due_at AS task_due, u.name AS inviter_name
           FROM task_collaborators c
           JOIN tasks t ON t.id = c.task_id
           LEFT JOIN users u ON u.id = c.invited_by
          WHERE c.user_id = $1 AND c.status = 'pending' ORDER BY c.created_at DESC`,
        [userId],
      )
      return rows.map((r) => ({
        ...toCollab(r)!,
        taskTitle: s(r.task_title),
        taskDueAt: sOrNull(r.task_due),
        inviterName: s(r.inviter_name) || s(r.invited_by),
      }))
    },

    async myAcceptedMap(): Promise<Map<string, { remind: boolean; from: string }>> {
      const rows = await db.execute(
        `SELECT c.task_id, c.remind, u.name AS owner_name FROM task_collaborators c
           LEFT JOIN users u ON u.id = c.owner_id
          WHERE c.user_id = $1 AND c.status = 'accepted'`,
        [userId],
      )
      const m = new Map<string, { remind: boolean; from: string }>()
      for (const r of rows) m.set(s(r.task_id), { remind: Number(r.remind) === 1, from: s(r.owner_name) })
      return m
    },

    // 幂等邀请：复用 pending/accepted 行；declined 且未过冷却期 → null；否则重开 pending。
    async invite(
      taskId: string,
      targetUserId: string,
    ): Promise<{ collab: Collaborator; reused: boolean } | null> {
      const task = (
        await db.execute('SELECT id FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId])
      )[0]
      if (!task || targetUserId === userId) return null
      const existing = (
        await db.execute('SELECT * FROM task_collaborators WHERE task_id = $1 AND user_id = $2', [
          taskId,
          targetUserId,
        ])
      )[0]
      if (existing) {
        const status = s(existing.status)
        if (status === 'pending' || status === 'accepted') {
          return { collab: toCollab(existing)!, reused: true }
        }
        const respondedAt = sOrNull(existing.responded_at)
        if (
          status === 'declined' &&
          respondedAt &&
          nowMs() - new Date(respondedAt).getTime() < INVITE_COOLDOWN_MS
        ) {
          return null
        }
        await db.execute(
          `UPDATE task_collaborators SET status = 'pending', invited_by = $1, created_at = $2, responded_at = NULL WHERE id = $3`,
          [userId, nowIso(), s(existing.id)],
        )
        return { collab: (await get(s(existing.id)))!, reused: false }
      }
      const id = genId('clb')
      await db.execute(
        `INSERT INTO task_collaborators (id,task_id,owner_id,user_id,invited_by,status,remind,created_at)
         VALUES ($1,$2,$3,$4,$5,'pending',1,$6)`,
        [id, taskId, userId, targetUserId, userId, nowIso()],
      )
      return { collab: (await get(id))!, reused: false }
    },

    async respond(
      id: string,
      decision: CollabStatus,
      remind = true,
    ): Promise<Collaborator | undefined> {
      const row = (
        await db.execute(
          `SELECT id FROM task_collaborators WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
          [id, userId],
        )
      )[0]
      if (!row) return undefined
      if (decision !== 'accepted' && decision !== 'declined' && decision !== 'following') return undefined
      await db.execute(
        'UPDATE task_collaborators SET status = $1, remind = $2, responded_at = $3 WHERE id = $4',
        [decision, remind ? 1 : 0, nowIso(), id],
      )
      return get(id)
    },

    async leave(taskId: string): Promise<boolean> {
      const rows = await db.execute(
        `UPDATE task_collaborators SET status = 'left', responded_at = $1
          WHERE task_id = $2 AND user_id = $3 AND status IN ('accepted','following') RETURNING id`,
        [nowIso(), taskId, userId],
      )
      return rows.length > 0
    },

    async acceptedUsersOf(taskId: string): Promise<string[]> {
      const rows = await db.execute<{ user_id: string }>(
        `SELECT user_id FROM task_collaborators WHERE task_id = $1 AND status IN ('accepted','pending','following')`,
        [taskId],
      )
      return rows.map((r) => r.user_id)
    },

    // 完成通知接收者：任务 owner + accepted/following 协作者（调用方再排除操作者本人）。
    async watchersOf(taskId: string): Promise<string[]> {
      const t = (await db.execute<{ user_id: string }>('SELECT user_id FROM tasks WHERE id = $1', [taskId]))[0]
      const cs = (
        await db.execute<{ user_id: string }>(
          `SELECT user_id FROM task_collaborators WHERE task_id = $1 AND status IN ('accepted','following')`,
          [taskId],
        )
      ).map((r) => r.user_id)
      return t ? [t.user_id, ...cs] : cs
    },

    async removeForTask(taskId: string): Promise<void> {
      await db.execute('DELETE FROM task_collaborators WHERE task_id = $1', [taskId])
    },
  }
}

export function makeAutoRuleRepo(deps: CollabRepoDeps) {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())

  const all = async (): Promise<AutoRule[]> => {
    const rows = await db.execute(
      'SELECT * FROM auto_rules WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    )
    return rows.map((r) => ({
      id: s(r.id),
      userId,
      keyword: s(r.keyword),
      action: s(r.action),
      targetId: s(r.target_id),
      targetName: s(r.target_name),
      createdAt: s(r.created_at),
    }))
  }

  return {
    all,
    async create(keyword: string, targetId: string, targetName: string): Promise<AutoRule> {
      const id = genId('rule')
      await db.execute(
        `INSERT INTO auto_rules (id,user_id,keyword,action,target_id,target_name,created_at)
         VALUES ($1,$2,$3,'invite',$4,$5,$6)`,
        [id, userId, keyword, targetId, targetName || '', nowIso()],
      )
      return (await all()).find((r) => r.id === id)!
    },
    async remove(id: string): Promise<void> {
      await db.execute('DELETE FROM auto_rules WHERE id = $1 AND user_id = $2', [id, userId])
    },
  }
}
