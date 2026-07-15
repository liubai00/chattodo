// @linx/infra-identity-pg — users 仓储（1:1 承接 services/auth.js 的用户管理 + schema users 表）。
import { makePrefixedId } from '@linx/kernel-ids'
import type { IdentityUser, IdentityUserRow, IdentityRepo } from '@linx/domain-identity'

export const IDENTITY_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    account_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL
  )`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface IdentityRepoDeps {
  db: Queryable
  clock?: () => Date
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const s = (v: unknown): string => (v == null ? '' : String(v))

function toUser(r: Record<string, unknown> | undefined): IdentityUser | undefined {
  if (!r) return undefined
  return {
    id: s(r.id),
    name: s(r.name),
    accountName: s(r.account_name) || s(r.name),
    email: s(r.email),
    role: s(r.role),
    createdAt: s(r.created_at),
  }
}

export function makeIdentityRepo(deps: IdentityRepoDeps): IdentityRepo {
  const { db } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())

  const get = async (id: string): Promise<IdentityUser | undefined> =>
    toUser((await db.execute('SELECT * FROM users WHERE id = $1', [id]))[0])

  return {
    get,
    async countAll(): Promise<number> {
      const r = (await db.execute<{ c: number | string }>('SELECT COUNT(*) AS c FROM users'))[0]
      return Number(r?.c ?? 0)
    },
    async findByEmail(emailLower: string): Promise<IdentityUserRow | undefined> {
      const r = (await db.execute('SELECT * FROM users WHERE email = $1', [String(emailLower).trim().toLowerCase()]))[0]
      const u = toUser(r)
      return u ? { ...u, passwordHash: s(r!.password_hash) } : undefined
    },
    async create(input): Promise<string> {
      const id = input.id ?? genId('u')
      await db.execute(
        'INSERT INTO users (id,name,account_name,email,password_hash,role,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, input.name, input.name, String(input.email).trim().toLowerCase(), input.passwordHash, input.role, nowIso()],
      )
      return id
    },
    async updateProfile(id, patch): Promise<IdentityUser | undefined> {
      const sets: string[] = []
      const vals: unknown[] = []
      const push = (col: string, v: unknown): void => {
        vals.push(v)
        sets.push(`${col} = $${vals.length}`)
      }
      if (typeof patch.name === 'string' && patch.name.trim()) push('name', patch.name.trim())
      if (typeof patch.accountName === 'string' && patch.accountName.trim()) push('account_name', patch.accountName.trim())
      if (sets.length) {
        vals.push(id)
        await db.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals)
      }
      return get(id)
    },
    async setPasswordHash(id, passwordHash): Promise<void> {
      await db.execute('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id])
    },
  }
}
