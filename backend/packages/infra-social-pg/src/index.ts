// @linx/infra-social-pg — friendships 仓储（镜像现网 schema.sql + services/friends.js 查询）。
import { makePrefixedId } from '@linx/kernel-ids'
import type {
  Friendship,
  FriendshipRow,
  FriendshipRepo,
  FriendStatus,
} from '@linx/domain-social'

export const SOCIAL_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    addressee_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    responded_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))`,
  `CREATE INDEX IF NOT EXISTS idx_friend_addressee ON friendships(addressee_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_friend_requester ON friendships(requester_id, status)`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface SocialRepoDeps {
  db: Queryable
  clock?: () => Date
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const s = (v: unknown): string => (v == null ? '' : String(v))
const sOrNull = (v: unknown): string | null => (v == null ? null : String(v))

function rowToFriendship(r: Record<string, unknown>): Friendship {
  return {
    id: s(r.id),
    requesterId: s(r.requester_id),
    addresseeId: s(r.addressee_id),
    status: s(r.status) as FriendStatus,
    createdAt: s(r.created_at),
    respondedAt: sOrNull(r.responded_at),
  }
}
function rowToFriendshipRow(r: Record<string, unknown>): FriendshipRow {
  return {
    ...rowToFriendship(r),
    requesterName: sOrNull(r.r_name),
    requesterEmail: sOrNull(r.r_email),
    addresseeName: sOrNull(r.a_name),
    addresseeEmail: sOrNull(r.a_email),
  }
}

export function makeFriendshipRepo(deps: SocialRepoDeps): FriendshipRepo {
  const { db } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())

  return {
    async findPair(a, b): Promise<Friendship | undefined> {
      const rows = await db.execute(
        `SELECT * FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $3 AND addressee_id = $4)`,
        [a, b, b, a],
      )
      return rows[0] ? rowToFriendship(rows[0]) : undefined
    },

    async findById(id): Promise<Friendship | undefined> {
      const rows = await db.execute('SELECT * FROM friendships WHERE id = $1', [id])
      return rows[0] ? rowToFriendship(rows[0]) : undefined
    },

    async listForUser(userId): Promise<FriendshipRow[]> {
      const rows = await db.execute(
        `SELECT f.*, ru.name AS r_name, ru.email AS r_email, au.name AS a_name, au.email AS a_email
           FROM friendships f
           LEFT JOIN users ru ON ru.id = f.requester_id
           LEFT JOIN users au ON au.id = f.addressee_id
          WHERE f.requester_id = $1 OR f.addressee_id = $2
          ORDER BY f.created_at DESC, f.id DESC`,
        [userId, userId],
      )
      return rows.map(rowToFriendshipRow)
    },

    async acceptedFriendIds(userId): Promise<string[]> {
      const rows = await db.execute<{ requester_id: string; addressee_id: string }>(
        `SELECT requester_id, addressee_id FROM friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $2)`,
        [userId, userId],
      )
      return rows.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
    },

    async insertPending(requesterId, addresseeId): Promise<Friendship> {
      const id = genId('fr')
      const now = nowIso()
      await db.execute(
        `INSERT INTO friendships (id,requester_id,addressee_id,status,created_at) VALUES ($1,$2,$3,'pending',$4)`,
        [id, requesterId, addresseeId, now],
      )
      return { id, requesterId, addresseeId, status: 'pending', createdAt: now, respondedAt: null }
    },

    async setStatus(id, status): Promise<void> {
      await db.execute('UPDATE friendships SET status = $1, responded_at = $2 WHERE id = $3', [
        status,
        nowIso(),
        id,
      ])
    },

    async reRequest(id, requesterId, addresseeId): Promise<void> {
      await db.execute(
        `UPDATE friendships SET requester_id = $1, addressee_id = $2, status = 'pending', created_at = $3, responded_at = NULL WHERE id = $4`,
        [requesterId, addresseeId, nowIso(), id],
      )
    },

    async remove(id): Promise<void> {
      await db.execute('DELETE FROM friendships WHERE id = $1', [id])
    },
  }
}
