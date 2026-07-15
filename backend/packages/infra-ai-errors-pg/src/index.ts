// @linx/infra-ai-errors-pg — ai_errors 仓储（1:1 承接 repositories.aiErrors）。
import { makePrefixedId } from '@linx/kernel-ids'
import type { AiError, AiErrorInput, AiErrorRepo } from '@linx/domain-ai-errors'

export const AI_ERRORS_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS ai_errors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'u_default',
    raw_input TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
]

export interface Queryable {
  execute<R = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<R[]>
}

export interface AiErrorRepoDeps {
  db: Queryable
  userId: string
  clock?: () => Date
  genId?: (prefix: string) => string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const s = (v: unknown): string => (v == null ? '' : String(v))

export function makeAiErrorRepo(deps: AiErrorRepoDeps): AiErrorRepo {
  const { db, userId } = deps
  const clock = deps.clock ?? ((): Date => new Date())
  const nowIso = (): string => {
    const d = clock()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const genId = deps.genId ?? ((prefix: string): string => makePrefixedId(prefix)())

  return {
    async create(data: AiErrorInput): Promise<string> {
      const id = data.id || genId('err')
      await db.execute(
        'INSERT INTO ai_errors (id,user_id,raw_input,message,created_at) VALUES ($1,$2,$3,$4,$5)',
        [id, userId, data.rawInput ?? '', data.message ?? '', nowIso()],
      )
      return id
    },
    async all(): Promise<AiError[]> {
      const rows = await db.execute(
        'SELECT * FROM ai_errors WHERE user_id = $1 ORDER BY created_at DESC, id DESC',
        [userId],
      )
      return rows.map((r) => ({
        id: s(r.id),
        rawInput: s(r.raw_input),
        message: s(r.message),
        createdAt: s(r.created_at),
      }))
    },
  }
}
