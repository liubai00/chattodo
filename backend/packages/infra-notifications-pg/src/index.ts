// @linx/infra-notifications-pg — notifications 仓储（1:1 承接 repositories.notifications）。
import { makePrefixedId } from '@linx/kernel-ids'
import type {
  Notification,
  NotificationInput,
  NotificationRepo,
} from '@linx/domain-notifications'

export const NOTIFICATIONS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    type TEXT,
    icon TEXT,
    color TEXT,
    text TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    action_type TEXT,
    action_ref TEXT,
    handled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id)`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface NotificationRepoDeps {
  db: Queryable
  userId: string
  clock?: () => Date
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const s = (v: unknown): string => (v == null ? '' : String(v))
const sOrNull = (v: unknown): string | null => (v == null ? null : String(v))

function toNotif(r: Record<string, unknown>): Notification {
  return {
    id: s(r.id),
    type: sOrNull(r.type),
    icon: sOrNull(r.icon),
    color: sOrNull(r.color),
    text: s(r.text),
    read: Number(r.read) === 1,
    actionType: sOrNull(r.action_type),
    actionRef: sOrNull(r.action_ref),
    handled: Number(r.handled) === 1,
    createdAt: s(r.created_at),
  }
}

export function makeNotificationRepo(deps: NotificationRepoDeps): NotificationRepo {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())

  return {
    async all(): Promise<Notification[]> {
      const rows = await db.execute(
        // 二级键 id DESC：created_at 分精度，同分钟行加唯一 PK 稳定全序（承现网主序，补确定性）。
        'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
        [userId],
      )
      return rows.map(toNotif)
    },

    async create(data: NotificationInput): Promise<Notification> {
      const id = data.id || genId('nt')
      await db.execute(
        `INSERT INTO notifications (id,user_id,type,icon,color,text,read,action_type,action_ref,handled,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10)`,
        [
          id,
          userId,
          data.type ?? null,
          data.icon ?? null,
          data.color ?? null,
          data.text,
          data.read ? 1 : 0,
          data.actionType ?? null,
          data.actionRef ?? null,
          data.createdAt || nowIso(),
        ],
      )
      const row = (await db.execute('SELECT * FROM notifications WHERE id = $1', [id]))[0]
      return toNotif(row!)
    },

    async markAllRead(): Promise<void> {
      await db.execute('UPDATE notifications SET read = 1 WHERE user_id = $1', [userId])
    },

    async markRead(id: string): Promise<void> {
      await db.execute('UPDATE notifications SET read = 1 WHERE id = $1 AND user_id = $2', [id, userId])
    },

    async markHandledByRef(actionRef: string): Promise<void> {
      await db.execute(
        'UPDATE notifications SET handled = 1, read = 1 WHERE user_id = $1 AND action_ref = $2',
        [userId, actionRef],
      )
    },

    async existsToday(text: string): Promise<boolean> {
      const rows = await db.execute(
        `SELECT 1 AS ok FROM notifications WHERE user_id = $1 AND text = $2 AND substr(created_at,1,10) = $3 LIMIT 1`,
        [userId, text, nowIso().slice(0, 10)],
      )
      return rows.length > 0
    },
  }
}
