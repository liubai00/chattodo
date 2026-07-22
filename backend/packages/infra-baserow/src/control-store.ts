import { secureHex, sha256 } from './signing.js'

export const BASEROW_CONTROL_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS baserow_team_invites (
    token_hash TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_by TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_baserow_team_invites_expiry ON baserow_team_invites (expires_at)`,
  `CREATE TABLE IF NOT EXISTS baserow_launch_tickets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    target_space TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_baserow_launch_tickets_expiry ON baserow_launch_tickets (expires_at)`,
  `CREATE TABLE IF NOT EXISTS baserow_hmac_nonces (
    nonce TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_baserow_hmac_nonces_expiry ON baserow_hmac_nonces (expires_at)`,
]

export interface BaserowControlDb {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface LaunchTicketRecord {
  readonly userId: string
  readonly targetSpace: 'team' | 'personal'
}

export interface TeamInviteSummary {
  readonly tokenHash: string
  readonly createdBy: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly usedAt: string | null
  readonly usedBy: string | null
}

export interface BaserowControlStore {
  createInvite(createdBy: string, ttlMs?: number): Promise<{ token: string; expiresAt: string }>
  listInvites(): Promise<readonly TeamInviteSummary[]>
  claimInvite(token: string, userId: string): Promise<boolean>
  releaseInvite(token: string, userId: string): Promise<void>
  createLaunchTicket(userId: string, targetSpace: 'team' | 'personal', ttlMs?: number): Promise<{ ticket: string; expiresAt: string }>
  consumeLaunchTicket(ticket: string): Promise<LaunchTicketRecord | undefined>
  rememberNonce(nonce: string, ttlMs?: number): Promise<boolean>
}

export async function bootstrapBaserowControlSchema(db: BaserowControlDb): Promise<void> {
  for (const statement of BASEROW_CONTROL_DDL) await db.execute(statement)
}

export function createBaserowControlStore(
  db: BaserowControlDb,
  options: { clock?: () => Date; randomToken?: () => string } = {},
): BaserowControlStore {
  const clock = options.clock ?? (() => new Date())
  const randomToken = options.randomToken ?? (() => secureHex(32))
  const now = (): Date => clock()

  return {
    async createInvite(createdBy, ttlMs = 7 * 24 * 60 * 60 * 1000) {
      const token = randomToken()
      const createdAt = now()
      const expiresAt = new Date(createdAt.getTime() + ttlMs)
      await db.execute(
        `INSERT INTO baserow_team_invites (token_hash,created_by,created_at,expires_at)
         VALUES ($1,$2,$3,$4)`,
        [sha256(token), createdBy, createdAt.toISOString(), expiresAt.toISOString()],
      )
      return { token, expiresAt: expiresAt.toISOString() }
    },

    async listInvites() {
      const rows = await db.execute<{
        token_hash: string
        created_by: string
        created_at: string
        expires_at: string
        used_at: string | null
        used_by: string | null
      }>(
        `SELECT token_hash,created_by,created_at,expires_at,used_at,used_by
           FROM baserow_team_invites ORDER BY created_at DESC LIMIT 100`,
      )
      return rows.map((row) => ({
        tokenHash: row.token_hash,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        usedAt: row.used_at,
        usedBy: row.used_by,
      }))
    },

    async claimInvite(token, userId) {
      if (!token) return false
      const claimedAt = now().toISOString()
      const rows = await db.execute<{ token_hash: string }>(
        `UPDATE baserow_team_invites
            SET used_at = $1, used_by = $2
          WHERE token_hash = $3 AND used_at IS NULL AND expires_at > $1
          RETURNING token_hash`,
        [claimedAt, userId, sha256(token)],
      )
      return rows.length === 1
    },

    async releaseInvite(token, userId) {
      await db.execute(
        `UPDATE baserow_team_invites SET used_at = NULL, used_by = NULL
          WHERE token_hash = $1 AND used_by = $2`,
        [sha256(token), userId],
      )
    },

    async createLaunchTicket(userId, targetSpace, ttlMs = 60_000) {
      const ticket = randomToken()
      const createdAt = now()
      const expiresAt = new Date(createdAt.getTime() + ttlMs)
      await db.execute('DELETE FROM baserow_launch_tickets WHERE expires_at <= $1', [createdAt.toISOString()])
      await db.execute(
        `INSERT INTO baserow_launch_tickets (token_hash,user_id,target_space,created_at,expires_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [sha256(ticket), userId, targetSpace, createdAt.toISOString(), expiresAt.toISOString()],
      )
      return { ticket, expiresAt: expiresAt.toISOString() }
    },

    async consumeLaunchTicket(ticket) {
      if (!ticket) return undefined
      const consumedAt = now().toISOString()
      const rows = await db.execute<{ user_id: string; target_space: 'team' | 'personal' }>(
        `UPDATE baserow_launch_tickets
            SET consumed_at = $1
          WHERE token_hash = $2 AND consumed_at IS NULL AND expires_at > $1
          RETURNING user_id,target_space`,
        [consumedAt, sha256(ticket)],
      )
      const row = rows[0]
      return row ? { userId: row.user_id, targetSpace: row.target_space } : undefined
    },

    async rememberNonce(nonce, ttlMs = 2 * 60_000) {
      if (!/^[a-f0-9]{16,128}$/i.test(nonce)) return false
      const createdAt = now()
      const expiresAt = new Date(createdAt.getTime() + ttlMs)
      await db.execute('DELETE FROM baserow_hmac_nonces WHERE expires_at <= $1', [createdAt.toISOString()])
      const rows = await db.execute<{ nonce: string }>(
        `INSERT INTO baserow_hmac_nonces (nonce,created_at,expires_at)
         VALUES ($1,$2,$3) ON CONFLICT (nonce) DO NOTHING RETURNING nonce`,
        [nonce, createdAt.toISOString(), expiresAt.toISOString()],
      )
      return rows.length === 1
    },
  }
}
